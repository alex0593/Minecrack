//! Filesystem invariants shared by IPC, archives and synchronization.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};

pub const MAX_FILE: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_EXPANDED: u64 = 16 * 1024 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 100_000;
pub const MAX_JSON: u64 = 16 * 1024 * 1024;

pub fn relative(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty()
        || raw.len() > 4096
        || raw.contains(['\\', ':'])
        || raw.chars().any(char::is_control)
    {
        return Err("Ruta relativa inválida".into());
    }
    for part in raw.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(part, "" | "." | "..")
            || part.ends_with(['.', ' '])
            || part.contains(['<', '>', '"', '|', '?', '*'])
            || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            return Err("Componente de ruta inseguro".into());
        }
    }
    Ok(PathBuf::from(raw))
}

pub fn filename(raw: &str) -> Result<(), String> {
    if relative(raw)?.components().count() != 1 {
        return Err("Se requiere un nombre de archivo sin directorios".into());
    }
    Ok(())
}

pub fn root() -> Result<PathBuf, String> {
    let root = dirs::data_dir()
        .ok_or("Directorio de datos no disponible")?
        .join("minecrack");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    root.canonicalize().map_err(|e| e.to_string())
}

pub fn no_links(path: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err("No se permite .. en rutas".into());
        }
        current.push(component);
        match std::fs::symlink_metadata(&current) {
            Ok(meta) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err("No se permiten reparse points".into());
                    }
                }
                if meta.file_type().is_symlink() {
                    return Err("No se permiten enlaces simbólicos".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

pub fn beneath(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let suffix = path
        .strip_prefix(root)
        .map_err(|_| "Ruta fuera del directorio autorizado")?;
    if !suffix.as_os_str().is_empty() {
        relative(
            &suffix
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/"),
        )?;
    }
    no_links(path)?;
    Ok(path.to_path_buf())
}

pub fn managed(path: &Path) -> Result<PathBuf, String> {
    beneath(&root()?, path)
}

pub fn instance(base: &str, id: &str) -> Result<PathBuf, String> {
    if Path::new(base) != root()? {
        return Err("Raíz del launcher inválida".into());
    }
    filename(id)?;
    managed(&Path::new(base).join("instances").join(id))
}

pub fn bounded_read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    no_links(path)?;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Archivo demasiado grande".into());
    }
    Ok(bytes)
}

/// Atomic replacement on both Unix and Windows. Never deletes the old destination first.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    no_links(path)?;
    let parent = path.parent().ok_or("Destino sin directorio")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(bytes).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

pub async fn lock(path: &Path) -> tokio::sync::OwnedMutexGuard<()> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let mutex = {
        let mut locks = LOCKS.get_or_init(Default::default).lock().unwrap();
        locks.retain(|_, lock| lock.strong_count() > 0);
        let mutex = locks
            .get(path)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| Arc::new(tokio::sync::Mutex::new(())));
        locks.insert(path.to_path_buf(), Arc::downgrade(&mutex));
        mutex
    };
    mutex.lock_owned().await
}

pub fn sha1(path: &Path) -> Result<String, String> {
    use sha1::{Digest, Sha1};
    no_links(path)?;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha1::new();
    let mut buffer = [0; 64 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_paths_reject_escapes_and_windows_aliases() {
        for bad in [
            "../a", "/a", "a/../b", "a\\b", "C:/a", "a:ads", "CON.jar", "lpt1.txt", "a//b", "a./b",
            "a\0b",
        ] {
            assert!(relative(bad).is_err(), "{bad:?}");
        }
        assert!(relative("mods/mod con ñ.jar").is_ok());
    }
    #[test]
    fn replacement_preserves_complete_content() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("state.json");
        atomic_write(&file, b"old").unwrap();
        atomic_write(&file, b"new").unwrap();
        assert_eq!(std::fs::read(file).unwrap(), b"new");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[cfg(unix)]
    #[test]
    fn rejects_existing_symlink() {
        let dir = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink("/tmp", dir.path().join("link")).unwrap();
        assert!(beneath(dir.path(), &dir.path().join("link/file")).is_err());
    }
}
