//! All untrusted archives are expanded into private staging before touching live files.
use crate::safe_fs::{self, MAX_ENTRIES, MAX_EXPANDED, MAX_FILE};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::Path;

fn copy_entry(
    reader: impl Read,
    path: &Path,
    declared: u64,
    total: &mut u64,
) -> Result<(), String> {
    if declared > MAX_FILE || total.checked_add(declared).ok_or("Tamaño inválido")? > MAX_EXPANDED
    {
        return Err("El archivo supera los límites de extracción".into());
    }
    safe_fs::no_links(path)?;
    std::fs::create_dir_all(path.parent().ok_or("Ruta inválida")?).map_err(|e| e.to_string())?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let count =
        std::io::copy(&mut reader.take(declared + 1), &mut output).map_err(|e| e.to_string())?;
    if count != declared {
        return Err("Tamaño expandido distinto al declarado".into());
    }
    *total += count;
    output.flush().map_err(|e| e.to_string())
}

pub fn zip_to_stage(source: &Path, stage: &Path, strip_root: bool) -> Result<(), String> {
    let file = std::fs::File::open(source).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if zip.len() > MAX_ENTRIES {
        return Err("Demasiadas entradas en ZIP".into());
    }
    let mut seen = HashSet::new();
    let mut total = 0;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().trim_end_matches('/');
        safe_fs::relative(name)?;
        entry.enclosed_name().ok_or("Ruta ZIP fuera del destino")?;
        let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
        if mode != 0 && mode != 0o100000 && mode != 0o040000 {
            return Err("No se permiten enlaces ni archivos especiales en ZIP".into());
        }
        let name = if strip_root {
            name.split_once('/').map(|(_, rest)| rest).unwrap_or("")
        } else {
            name
        };
        if name.is_empty() {
            continue;
        }
        let relative = safe_fs::relative(name)?;
        if !seen.insert(name.to_lowercase()) {
            return Err("Entradas ZIP duplicadas".into());
        }
        let output = stage.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(output).map_err(|e| e.to_string())?;
        } else {
            let size = entry.size();
            copy_entry(&mut entry, &output, size, &mut total)?;
        }
    }
    Ok(())
}

pub fn tar_runtime_to_stage(source: &Path, stage: &Path) -> Result<(), String> {
    let input = std::fs::File::open(source).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(input));
    let mut seen = HashSet::new();
    let mut links = Vec::new();
    let mut total = 0;
    for (i, entry) in archive.entries().map_err(|e| e.to_string())?.enumerate() {
        if i >= MAX_ENTRIES {
            return Err("Demasiadas entradas TAR".into());
        }
        let mut entry = entry.map_err(|e| e.to_string())?;
        let raw = entry
            .path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned();
        safe_fs::relative(raw.trim_end_matches('/'))?;
        let name = raw
            .trim_end_matches('/')
            .split_once('/')
            .map(|(_, rest)| rest)
            .unwrap_or("");
        if name.is_empty() {
            continue;
        }
        let relative = safe_fs::relative(name)?;
        if !seen.insert(name.to_lowercase()) {
            return Err("Entradas TAR duplicadas".into());
        }
        let output = stage.join(&relative);
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            std::fs::create_dir_all(&output).map_err(|e| e.to_string())?;
        } else if kind.is_file() {
            let size = entry.size();
            copy_entry(&mut entry, &output, size, &mut total)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let executable = entry.header().mode().map_err(|e| e.to_string())? & 0o111 != 0;
                std::fs::set_permissions(
                    output,
                    std::fs::Permissions::from_mode(if executable { 0o700 } else { 0o600 }),
                )
                .map_err(|e| e.to_string())?;
            }
        } else if kind.is_symlink() {
            let target = entry
                .link_name()
                .map_err(|e| e.to_string())?
                .ok_or("Enlace TAR sin destino")?
                .into_owned();
            if target.is_absolute() {
                return Err("Enlace TAR absoluto".into());
            }
            // Resolve only after regular files exist; materialize as a copy, never a link.
            links.push((output, target));
        } else {
            return Err("Tipo TAR no permitido (hard link o archivo especial)".into());
        }
    }
    let canonical_stage = stage.canonicalize().map_err(|e| e.to_string())?;
    for (output, target) in links {
        let target = output
            .parent()
            .unwrap()
            .join(target)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !target.starts_with(&canonical_stage) || !target.is_file() {
            return Err("Enlace TAR fuera del runtime".into());
        }
        let size = target.metadata().map_err(|e| e.to_string())?.len();
        copy_entry(
            std::fs::File::open(&target).map_err(|e| e.to_string())?,
            &output,
            size,
            &mut total,
        )?;
        std::fs::set_permissions(
            output,
            target.metadata().map_err(|e| e.to_string())?.permissions(),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    safe_fs::no_links(source)?;
    safe_fs::no_links(destination)?;
    if destination.starts_with(source) {
        return Err("No se puede copiar un directorio dentro de sí mismo".into());
    }
    fn visit(
        source: &Path,
        destination: &Path,
        count: &mut usize,
        total: &mut u64,
    ) -> Result<(), String> {
        safe_fs::no_links(source)?;
        safe_fs::no_links(destination)?;
        std::fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            *count += 1;
            if *count > MAX_ENTRIES {
                return Err("Demasiados archivos".into());
            }
            safe_fs::filename(&entry.file_name().to_string_lossy())?;
            safe_fs::no_links(&entry.path())?;
            let dest = destination.join(entry.file_name());
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                visit(&entry.path(), &dest, count, total)?;
            } else {
                safe_fs::no_links(&dest)?;
                let size = entry.metadata().map_err(|e| e.to_string())?.len();
                if size > MAX_FILE || *total + size > MAX_EXPANDED {
                    return Err("Copia demasiado grande".into());
                }
                *total += size;
                let mut temp =
                    tempfile::NamedTempFile::new_in(destination).map_err(|e| e.to_string())?;
                let mut input = std::fs::File::open(entry.path()).map_err(|e| e.to_string())?;
                let copied = std::io::copy(&mut (&mut input).take(size + 1), &mut temp)
                    .map_err(|e| e.to_string())?;
                if copied != size {
                    return Err("El archivo cambió durante la copia".into());
                }
                temp.as_file().sync_all().map_err(|e| e.to_string())?;
                temp.persist(dest).map_err(|e| e.error.to_string())?;
            }
        }
        Ok(())
    }
    visit(source, destination, &mut 0, &mut 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malicious_zip_never_reaches_live_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("input.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        zip.start_file("../escaped.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"bad").unwrap();
        zip.finish().unwrap();
        let stage = tempfile::tempdir_in(dir.path()).unwrap();
        assert!(zip_to_stage(&path, stage.path(), false).is_err());
        assert!(!dir.path().join("escaped.txt").exists());
    }
}
