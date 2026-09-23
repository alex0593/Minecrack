//! Explicit native permissions. External paths are granted only by a native dialog.
use crate::safe_fs;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri_plugin_dialog::DialogExt;

#[derive(Clone)]
struct Grant {
    path: PathBuf,
    directory: bool,
    write: bool,
}
fn grants() -> &'static Mutex<Vec<Grant>> {
    static GRANTS: OnceLock<Mutex<Vec<Grant>>> = OnceLock::new();
    GRANTS.get_or_init(Default::default)
}

fn external(path: &Path, write: bool) -> Result<(), String> {
    safe_fs::no_links(path)?;
    let grants = grants().lock().map_err(|_| "Permisos no disponibles")?;
    if grants.iter().any(|grant| {
        (!write || grant.write)
            && (path == grant.path || (grant.directory && path.starts_with(&grant.path)))
    }) {
        Ok(())
    } else {
        Err("Selecciona la ruta mediante el diálogo nativo antes de usarla".into())
    }
}

pub fn read(path: &Path) -> Result<(), String> {
    if safe_fs::managed(path).is_ok() {
        Ok(())
    } else {
        external(path, false)
    }
}

pub fn write(path: &Path, allow_root: bool) -> Result<(), String> {
    let root = safe_fs::root()?;
    if let Ok(relative) = path.strip_prefix(&root) {
        safe_fs::beneath(&root, path)?;
        let first = relative
            .components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().to_string());
        if first.is_none() && !allow_root {
            return Err("No se puede modificar la raíz del launcher".into());
        }
        if matches!(first.as_deref(), Some("runtimes" | ".security")) {
            return Err("Directorio reservado al backend".into());
        }
        Ok(())
    } else {
        external(path, true)
    }
}

pub fn validate(command: &str, args: &Value) -> Result<(), String> {
    if let Some(base) = args.get("launcherDir").and_then(Value::as_str) {
        if Path::new(base) != safe_fs::root()? {
            return Err("Raíz del launcher inválida".into());
        }
    }
    for key in ["instanceId", "filename"] {
        if let Some(name) = args.get(key).and_then(Value::as_str) {
            safe_fs::filename(name)?;
        }
    }
    let input = |key: &str| -> Result<&Path, String> {
        args.get(key)
            .and_then(Value::as_str)
            .map(Path::new)
            .ok_or_else(|| format!("Falta {key}"))
    };
    match command {
        "write_file" | "write_file_base64" | "delete_file" | "remove_dir" => {
            write(input("path")?, false)?
        }
        "ensure_dir" | "create_dir_all" => write(input("path")?, true)?,
        "read_file" | "read_file_base64" | "file_exists" => read(input("path")?)?,
        "copy_file" => {
            read(input("src")?)?;
            write(input("dest")?, false)?;
        }
        "copy_dir" => {
            read(input("src")?)?;
            write(input("dst")?, false)?;
        }
        "download_file" => write(input("dest")?, false)?,
        "extract_zip" => {
            read(input("zipPath")?)?;
            write(input("destDir")?, false)?;
        }
        "inspect_instance_zip" | "import_instance_from_zip" => read(input("zipPath")?)?,
        "inspect_mods_zip" | "import_instance_mods" => read(input("srcZip")?)?,
        "inspect_instance_folder" | "import_instance_from_folder" => read(input("folderPath")?)?,
        "add_resourcepack" | "add_shaderpack" => read(input("srcPath")?)?,
        "get_mods_to_download" => read(input("instancePath")?)?,
        "export_instance_mods" => write(input("destZip")?, false)?,
        _ => (),
    }
    if let (Some(base), Some(id)) = (
        args.get("launcherDir").and_then(Value::as_str),
        args.get("instanceId").and_then(Value::as_str),
    ) {
        safe_fs::instance(base, id)?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct Filter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
pub async fn select_path(
    app: tauri::AppHandle,
    title: String,
    directory: bool,
    save: bool,
    filters: Option<Vec<Filter>>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title(&title);
        for filter in filters.unwrap_or_default() {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(filter.name, &extensions);
        }
        let selection = if directory {
            dialog.blocking_pick_folder()
        } else if save {
            dialog.blocking_save_file()
        } else {
            dialog.blocking_pick_file()
        };
        let Some(selection) = selection else {
            return Ok(None);
        };
        let path = selection.into_path().map_err(|e| e.to_string())?;
        safe_fs::no_links(&path)?;
        let mut grants = grants().lock().map_err(|_| "Permisos no disponibles")?;
        if grants.len() >= 256 {
            grants.remove(0);
        }
        grants.push(Grant {
            path: path.clone(),
            directory,
            write: save,
        });
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}
