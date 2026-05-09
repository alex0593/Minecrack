use std::path::PathBuf;
use std::io::{Write, Read};
use serde::{Deserialize, Serialize};
use sha1::{Sha1, Digest};
use futures_util::StreamExt;
use tauri::Emitter;
use flate2::read::GzDecoder;
use tar::Archive as TarArchive;

// ─────────────────────────────────────────────────────────────────────────────
// Estructuras compartidas JS ↔ Rust
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub file:     String,
    pub received: u64,
    pub total:    u64,
    pub percent:  f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadTask {
    pub url:      String,
    pub dest:     String,   // ruta absoluta destino
    pub sha1:     Option<String>,
    pub label:    String,
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Devuelve el directorio base del launcher
// ~/.minecrack  (o %APPDATA%/minecrack en Windows)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn get_launcher_dir() -> Result<String, String> {
    let base = dirs::data_dir()
        .ok_or("No se pudo obtener el directorio de datos del usuario")?;
    let launcher_dir = base.join("minecrack");
    std::fs::create_dir_all(&launcher_dir)
        .map_err(|e| e.to_string())?;
    Ok(launcher_dir.to_string_lossy().to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Crea un directorio (y sus padres) si no existe
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Guarda un string como archivo (JSON de instancias, perfiles, etc.)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content.as_bytes()).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Lee un archivo y devuelve su contenido como string
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Verifica si un archivo existe y opcionalmente comprueba su SHA1
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn file_exists(path: String, expected_sha1: Option<String>) -> bool {
    let p = PathBuf::from(&path);
    if !p.exists() { return false; }
    if let Some(expected) = expected_sha1 {
        let Ok(data) = std::fs::read(&p) else { return false; };
        let hash = format!("{:x}", Sha1::digest(&data));
        return hash == expected.to_lowercase();
    }
    true
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Descarga UN archivo con progreso via eventos Tauri
// Emite eventos: "download://progress" y "download://done" / "download://error"
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn download_file(
    window: tauri::Window,
    url:    String,
    dest:   String,
    sha1:   Option<String>,
    label:  String,
) -> Result<(), String> {
    let dest_path = PathBuf::from(&dest);

    // Si ya existe y el hash coincide, skip
    if dest_path.exists() {
        if let Some(ref expected) = sha1 {
            let data = std::fs::read(&dest_path).map_err(|e| e.to_string())?;
            let hash = format!("{:x}", Sha1::digest(&data));
            if &hash == expected {
                let _ = window.emit("download://progress", DownloadProgress {
                    file: label.clone(), received: 1, total: 1, percent: 100.0,
                });
                return Ok(());
            }
        }
    }

    // Crear directorio padre
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // HTTP GET con stream.
    // Deshabilitamos la descompresión automática de gzip para evitar errores de decodificación
    // al descargar archivos binarios grandes (JARs, ZIPs) que el servidor podría comprimir.
    let client = reqwest::Client::builder()
        .no_gzip()              // Evitar double-decompression en JARs que ya son ZIPs
        .no_brotli()
        .no_deflate()
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_error = String::new();

    for attempt in 1..=5 {
        let res = client.get(&url)
            .header("User-Agent", "Minecrack/1.0")
            .header("Accept-Encoding", "identity") // Pedir al servidor que no comprima
            .timeout(std::time::Duration::from_secs(300)) // 5 min para archivos grandes
            .send()
            .await;

        match res {
            Ok(response) => {
                if !response.status().is_success() {
                    last_error = format!("HTTP {}", response.status());
                    if attempt < 5 {
                        let delay = (attempt as u64) * 3; // 3s, 6s, 9s, 12s
                        tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                    }
                    continue;
                }

                let total = response.content_length().unwrap_or(0);
                let mut received: u64 = 0;
                let mut stream = response.bytes_stream();
                let mut hasher = Sha1::new();  // Crear nuevo hasher para cada intento

                match std::fs::File::create(&dest_path) {
                    Ok(mut file) => {
                        let mut stream_error = false;
                        while let Some(chunk_result) = stream.next().await {
                            match chunk_result {
                                Ok(data) => {
                                    if let Err(e) = file.write_all(&data) {
                                        last_error = format!("Error escribiendo archivo: {}", e);
                                        stream_error = true;
                                        break;
                                    }
                                    hasher.update(&data);
                                    received += data.len() as u64;

                                    let percent = if total > 0 {
                                        (received as f64 / total as f64) * 100.0
                                    } else { 0.0 };

                                    let _ = window.emit("download://progress", DownloadProgress {
                                        file: label.clone(), received, total, percent,
                                    });
                                }
                                Err(e) => {
                                    last_error = format!("Error en stream: {}", e);
                                    stream_error = true;
                                    break;
                                }
                            }
                        }

                        if !stream_error {
                            // Descarga completada, verificar hash si es requerido
                            if let Some(expected) = &sha1 {
                                let final_hash = format!("{:x}", hasher.finalize());
                                if final_hash != expected.to_lowercase() {
                                    last_error = format!("SHA1 mismatch: esperado {}, obtenido {}", expected, final_hash);
                                    std::fs::remove_file(&dest_path).ok();
                                    if attempt < 5 {
                                        let delay = (attempt as u64) * 3; // 3s, 6s, 9s, 12s
                                        tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                                    }
                                    continue;  // Reintentar
                                }
                            }

                            // Descarga y hash válidos, salir
                            let _ = window.emit("download://done", &label);
                            return Ok(());
                        }
                    }
                    Err(e) => {
                        last_error = format!("Error creando archivo: {}", e);
                        if attempt < 5 {
                            let delay = (attempt as u64) * 3; // 3s, 6s, 9s, 12s
                            tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                        }
                        continue;
                    }
                }
            }
            Err(e) => {
                last_error = format!("Error en HTTP: {}", e);
                if attempt < 5 {
                    let delay = (attempt as u64) * 3; // 3s, 6s, 9s, 12s
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                }
            }
        }
    }

    // Si llegó aquí, todos los intentos fallaron
    std::fs::remove_file(&dest_path).ok();
    Err(format!("Error descargando {} (5 intentos fallados): {}", label, last_error))
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Lanza el juego Minecraft
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct LaunchConfig {
    pub java_path:   String,
    pub jvm_args:    Vec<String>,
    pub classpath:   String,
    pub main_class:  String,
    pub game_args:   Vec<String>,
    pub game_dir:    String,
}

#[tauri::command]
async fn launch_game(
    window: tauri::Window,
    config: LaunchConfig,
) -> Result<(), String> {
    use std::process::Stdio;

    let mut args: Vec<String> = config.jvm_args;
    args.push("-cp".to_string());
    args.push(config.classpath);
    args.push(config.main_class);
    args.extend(config.game_args);

    let mut child = tokio::process::Command::new(&config.java_path)
        .args(&args)
        .current_dir(&config.game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo lanzar Java: {}", e))?;

    let _ = window.emit("game://started", ());

    // Leer stdout en background
    if let Some(stdout) = child.stdout.take() {
        let win = window.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = win.emit("game://log", serde_json::json!({ "text": line, "level": "info" }));
            }
        });
    }

    // Leer stderr
    if let Some(stderr) = child.stderr.take() {
        let win = window.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let level = if line.contains("ERROR") || line.contains("Exception") {
                    "error"
                } else if line.contains("WARN") {
                    "warn"
                } else {
                    "info"
                };
                let _ = win.emit("game://log", serde_json::json!({ "text": line, "level": level }));
            }
        });
    }

    // Esperar que el juego cierre
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = window.emit("game://stopped", status.code().unwrap_or(-1));
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Estructura: Información de un mod
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModInfo {
    pub filename: String,       // ej: "sodium-0.5.3.jar"
    pub name:     String,       // ej: "Sodium"
    pub version:  String,       // ej: "0.5.3"
    pub enabled:  bool,         // true si es .jar, false si es .jar.disabled
}

// ─────────────────────────────────────────────────────────────────────────────
// Estructura: Manifest dentro del ZIP de mods
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModsZipManifest {
    pub minecrack_version: String,
    pub instance_name:     String,
    pub mc_version:        String,
    pub loader:            String,
    pub loader_version:    Option<String>,
    pub mods:              Vec<ModsZipEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModsZipEntry {
    pub filename: String,
    pub sha1:     Option<String>,
    pub enabled:  bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Estructuras: Resultados de export/import
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub path:      String,
    pub size_bytes: u64,
    pub mod_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped:  usize,
    pub conflicts: usize,
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Lista los mods de una instancia leyendo desde disco
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn list_mods(launcher_dir: String, instance_id: String) -> Result<Vec<ModInfo>, String> {
    let mods_dir = PathBuf::from(launcher_dir).join("instances").join(&instance_id).join("mods");

    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let mut mods = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy().to_string();

            // Solo procesar archivos .jar o .jar.disabled
            if !filename_str.ends_with(".jar") && !filename_str.ends_with(".jar.disabled") {
                continue;
            }

            let enabled = filename_str.ends_with(".jar");
            let (name, version) = extract_mod_metadata(&path).unwrap_or_else(|| {
                // Si no se puede extraer metadata, usar nombre del archivo
                let clean_name = filename_str.replace(".jar.disabled", "").replace(".jar", "");
                (clean_name.clone(), "unknown".to_string())
            });

            mods.push(ModInfo {
                filename: filename_str,
                name,
                version,
                enabled,
            });
        }
    }

    // Ordenar por nombre
    mods.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(mods)
}

// Helper: extrae metadata de un JAR (nombre y versión del mod)
fn extract_mod_metadata(jar_path: &PathBuf) -> Option<(String, String)> {
    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Intentar leer fabric.mod.json
    if let Ok(mut fabric_file) = archive.by_name("fabric.mod.json") {
        let mut content = String::new();
        if fabric_file.read_to_string(&mut content).is_ok() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let name = json["name"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string();
                let version = json["version"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string();
                return Some((name, version));
            }
        }
    }

    // Intentar leer mods.toml (Forge)
    if let Ok(mut forge_file) = archive.by_name("META-INF/mods.toml") {
        let mut content = String::new();
        if forge_file.read_to_string(&mut content).is_ok() {
            // Parse TOML simple para extraer [[mods]] name y version
            if let Some(name_line) = content.lines().find(|l| l.trim().starts_with("displayName")) {
                if let Some(start) = name_line.find('=') {
                    let name = name_line[start + 1..]
                        .trim()
                        .trim_matches('"')
                        .to_string();
                    let version = if let Some(ver_line) = content.lines().find(|l| l.trim().starts_with("version")) {
                        if let Some(ver_start) = ver_line.find('=') {
                            ver_line[ver_start + 1..]
                                .trim()
                                .trim_matches('"')
                                .to_string()
                        } else {
                            "unknown".to_string()
                        }
                    } else {
                        "unknown".to_string()
                    };
                    return Some((name, version));
                }
            }
        }
    }

    // Intentar leer quilt.mod.json (Quilt)
    if let Ok(mut quilt_file) = archive.by_name("quilt.mod.json") {
        let mut content = String::new();
        if quilt_file.read_to_string(&mut content).is_ok() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let name = json["quilt"]["metadata"]["name"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string();
                let version = json["quilt"]["metadata"]["version"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string();
                return Some((name, version));
            }
        }
    }

    None
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Elimina un mod
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn delete_mod(launcher_dir: String, instance_id: String, filename: String) -> Result<(), String> {
    let mod_path = PathBuf::from(launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("mods")
        .join(&filename);

    std::fs::remove_file(&mod_path)
        .map_err(|e| format!("No se pudo eliminar el mod: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Activa/desactiva un mod (renombra entre .jar y .jar.disabled)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn toggle_mod(launcher_dir: String, instance_id: String, filename: String, enabled: bool) -> Result<(), String> {
    let base_path = PathBuf::from(launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("mods");

    let current_path = base_path.join(&filename);

    // Determinar nuevo nombre
    let new_filename = if enabled {
        // Activar: .jar.disabled -> .jar
        filename.replace(".jar.disabled", ".jar")
    } else {
        // Desactivar: .jar -> .jar.disabled
        if filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
            format!("{}.disabled", filename)
        } else {
            return Err("El archivo debe ser .jar para desactivar".to_string());
        }
    };

    let new_path = base_path.join(&new_filename);

    std::fs::rename(&current_path, &new_path)
        .map_err(|e| format!("No se pudo cambiar estado del mod: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Exporta los mods de una instancia como archivo ZIP
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn export_instance_mods(
    launcher_dir: String,
    instance_id: String,
    dest_zip: String,
) -> Result<ExportResult, String> {
    let instance_dir = PathBuf::from(&launcher_dir)
        .join("instances")
        .join(&instance_id);
    let mods_dir = instance_dir.join("mods");
    let instances_json = PathBuf::from(&launcher_dir).join("instances.json");

    // Leer la instancia para obtener datos de versión y loader
    let instance_data = std::fs::read_to_string(&instances_json)
        .map_err(|e| format!("No se pudo leer instances.json: {}", e))?;
    let instances: Vec<serde_json::Value> = serde_json::from_str(&instance_data)
        .map_err(|e| format!("Error parseando instances.json: {}", e))?;
    let instance = instances
        .iter()
        .find(|i| i["id"].as_str() == Some(&instance_id))
        .ok_or("Instancia no encontrada")?;

    // Crear el manifest
    let manifest = ModsZipManifest {
        minecrack_version: "0.1.0".to_string(),
        instance_name: instance["name"].as_str().unwrap_or("Unnamed").to_string(),
        mc_version: instance["version"].as_str().unwrap_or("unknown").to_string(),
        loader: instance["loader"].as_str().unwrap_or("vanilla").to_string(),
        loader_version: instance["loaderVersion"].as_str().map(|s| s.to_string()),
        mods: Vec::new(), // Se completará al crear el ZIP
    };

    // Crear el ZIP
    let file = std::fs::File::create(&dest_zip)
        .map_err(|e| format!("No se pudo crear el ZIP: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);

    // Escribir el manifest
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Error serializando manifest: {}", e))?;
    zip.start_file("manifest.json", zip::write::SimpleFileOptions::default())
        .map_err(|e| format!("Error agregando manifest al ZIP: {}", e))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("Error escribiendo manifest: {}", e))?;

    // Contar y empaquetar mods
    let mut mod_count = 0;
    if mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = entry.file_name();
                let filename_str = filename.to_string_lossy().to_string();

                if !filename_str.ends_with(".jar") && !filename_str.ends_with(".jar.disabled") {
                    continue;
                }

                // Leer el archivo y agregarlo al ZIP
                let content = std::fs::read(&path)
                    .map_err(|e| format!("Error leyendo {}: {}", filename_str, e))?;

                zip.start_file(&filename_str, zip::write::SimpleFileOptions::default())
                    .map_err(|e| format!("Error agregando {} al ZIP: {}", filename_str, e))?;
                zip.write_all(&content)
                    .map_err(|e| format!("Error escribiendo {}: {}", filename_str, e))?;

                mod_count += 1;
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("Error finalizando ZIP: {}", e))?;

    // Obtener tamaño del archivo
    let size_bytes = std::fs::metadata(&dest_zip)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(ExportResult {
        path: dest_zip,
        size_bytes,
        mod_count,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Inspecciona un ZIP de mods antes de importar
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn inspect_mods_zip(src_zip: String) -> Result<ModsZipManifest, String> {
    let file = std::fs::File::open(&src_zip)
        .map_err(|e| format!("No se pudo abrir el ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("No es un ZIP válido: {}", e))?;

    // Leer el manifest.json — dropeamos el borrow mutable antes de llamar file_names()
    let manifest_content = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| "El ZIP no contiene manifest.json".to_string())?;
        let mut content = String::new();
        manifest_file.read_to_string(&mut content)
            .map_err(|e| format!("Error leyendo manifest.json: {}", e))?;
        content
    };

    let mut manifest: ModsZipManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Error parseando manifest.json: {}", e))?;

    // Ahora sí podemos tomar borrow inmutable
    let file_names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();

    for name in file_names {
        if (name.ends_with(".jar") || name.ends_with(".jar.disabled")) && name != "manifest.json" {
            let enabled = name.ends_with(".jar");
            manifest.mods.push(ModsZipEntry {
                filename: name.to_string(),
                sha1: None,
                enabled,
            });
        }
    }

    Ok(manifest)
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Importa mods desde un ZIP
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn import_instance_mods(
    launcher_dir: String,
    instance_id: String,
    src_zip: String,
    mode: String, // "merge" o "replace"
) -> Result<ImportResult, String> {
    let mods_dir = PathBuf::from(launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("mods");

    // Crear directorio si no existe
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| format!("No se pudo crear directorio de mods: {}", e))?;

    // Si el modo es "replace", vaciar el directorio
    if mode == "replace" {
        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    let file = std::fs::File::open(&src_zip)
        .map_err(|e| format!("No se pudo abrir el ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("No es un ZIP válido: {}", e))?;

    let mut imported = 0;
    let mut skipped = 0;
    let mut conflicts = 0;

    // Extraer archivos del ZIP
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Error leyendo archivo del ZIP: {}", e))?;
        let filename = file.name().to_string();

        // Saltar manifest y directorios
        if filename == "manifest.json" || filename.ends_with('/') {
            continue;
        }

        // Solo procesar archivos JAR
        if !filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
            skipped += 1;
            continue;
        }

        let dest_path = mods_dir.join(&filename);

        // Si el archivo ya existe en modo merge, renombrar con sufijo
        if mode == "merge" && dest_path.exists() {
            let base = filename.replace(".jar.disabled", "").replace(".jar", "");
            let (name, ext) = if filename.ends_with(".jar.disabled") {
                (base.clone(), ".jar.disabled")
            } else {
                (base.clone(), ".jar")
            };

            let mut new_filename = format!("{} (1){}", name, ext);
            let mut counter = 1;
            let mut new_path = mods_dir.join(&new_filename);

            while new_path.exists() {
                counter += 1;
                new_filename = format!("{} ({}){}", name, counter, ext);
                new_path = mods_dir.join(&new_filename);
            }

            let mut out_file = std::fs::File::create(&new_path)
                .map_err(|e| format!("Error creando archivo: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("Error escribiendo archivo: {}", e))?;
            conflicts += 1;
            imported += 1;
        } else {
            let mut out_file = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Error creando archivo: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("Error escribiendo archivo: {}", e))?;
            imported += 1;
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        conflicts,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Detecta instalaciones de Java en el sistema
// ─────────────────────────────────────────────────────────────────────────────
fn parse_java_major(version_str: &str) -> u32 {
    // Handles: "openjdk version \"21.0.1\"", "java version \"1.8.0_392\""
    for part in version_str.split_whitespace() {
        let clean = part.trim_matches('"');
        let nums: Vec<&str> = clean.split('.').collect();
        if let Some(first) = nums.first() {
            if let Ok(n) = first.parse::<u32>() {
                // Java 8 reports "1.8.x" — return 8
                if n == 1 {
                    if let Some(second) = nums.get(1) {
                        if let Ok(m) = second.parse::<u32>() {
                            return m;
                        }
                    }
                }
                if n >= 8 { return n; }
            }
        }
    }
    0
}

#[derive(Debug, Serialize)]
pub struct JavaInstall {
    pub path:          String,
    pub version:       String,
    pub major_version: u32,
}

#[tauri::command]
async fn detect_java(launcher_dir: Option<String>) -> Vec<JavaInstall> {
    let mut results = Vec::new();

    // Rutas comunes donde buscar java.exe / java
    let mut candidates: Vec<PathBuf> = {
        #[cfg(target_os = "windows")]
        {
            let mut paths = vec![
                PathBuf::from(r"C:\Program Files\Java"),
                PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
                PathBuf::from(r"C:\Program Files\Microsoft"),
            ];
            if let Ok(java_home) = std::env::var("JAVA_HOME") {
                paths.push(PathBuf::from(java_home));
            }
            paths
        }
        #[cfg(not(target_os = "windows"))]
        {
            vec![
                PathBuf::from("/usr/lib/jvm"),
                PathBuf::from("/usr/local/lib/jvm"),
                PathBuf::from("/opt/java"),
            ]
        }
    };

    // Agregar runtimes del launcher si se proporciona launcher_dir
    if let Some(launcher_path) = launcher_dir {
        let runtimes_path = PathBuf::from(&launcher_path).join("runtimes");
        candidates.push(runtimes_path);
    }

    for base in candidates {
        if !base.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                #[cfg(target_os = "windows")]
                let java_bin = entry.path().join("bin").join("java.exe");
                #[cfg(not(target_os = "windows"))]
                let java_bin = entry.path().join("bin").join("java");

                if java_bin.exists() {
                    if let Ok(output) = std::process::Command::new(&java_bin)
                        .arg("-version")
                        .output()
                    {
                        let ver_str = String::from_utf8_lossy(&output.stderr).to_string()
                            + &String::from_utf8_lossy(&output.stdout);
                        let first_line = ver_str.lines().next().unwrap_or("?").to_string();
                        let major = parse_java_major(&first_line);
                        results.push(JavaInstall {
                            path:          java_bin.to_string_lossy().to_string(),
                            version:       first_line,
                            major_version: major,
                        });
                    }
                }
            }
        }
    }

    // También intenta el java del PATH
    if let Ok(output) = std::process::Command::new("java").arg("-version").output() {
        let ver_str = String::from_utf8_lossy(&output.stderr).to_string();
        let first_line = ver_str.lines().next().unwrap_or("?").to_string();
        let major = parse_java_major(&first_line);
        results.insert(0, JavaInstall {
            path:          "java".to_string(),
            version:       first_line,
            major_version: major,
        });
    }

    results
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Descarga un mod directamente a instances/{id}/mods/
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn download_mod(
    window: tauri::Window,
    launcher_dir: String,
    instance_id: String,
    url: String,
    filename: String,
    sha1: Option<String>,
) -> Result<(), String> {
    let mods_dir = PathBuf::from(&launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let dest = mods_dir.join(&filename).to_string_lossy().to_string();
    // Reusar el comando download_file existente
    download_file(window, url, dest, sha1, filename).await
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Descarga e instala un Java Runtime desde Adoptium
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct JavaInstallProgress {
    pub phase:   String,
    pub percent: f64,
    pub label:   String,
}

#[tauri::command]
async fn install_java_runtime(
    window: tauri::Window,
    major_version: u32,
    launcher_dir: String,
) -> Result<String, String> {
    macro_rules! emit {
        ($phase:expr, $pct:expr, $lbl:expr) => {
            let _ = window.emit("java://progress", JavaInstallProgress {
                phase: $phase.to_string(), percent: $pct, label: $lbl.to_string(),
            });
        };
    }

    emit!("fetch", 0.0, "Consultando Adoptium API...");

    let os   = if cfg!(target_os = "windows") { "windows" }
               else if cfg!(target_os = "macos") { "mac" } else { "linux" };
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" };

    let api_url = format!(
        "https://api.adoptium.net/v3/assets/latest/{}/hotspot?architecture={}&image_type=jre&os={}&vendor=eclipse",
        major_version, arch, os
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    let api_resp = client.get(&api_url)
        .header("User-Agent", "Minecrack/1.0")
        .send().await
        .map_err(|e| format!("Error consultando Adoptium: {}", e))?;

    if !api_resp.status().is_success() {
        return Err(format!("Adoptium API devolvió HTTP {}", api_resp.status()));
    }

    let assets: serde_json::Value = api_resp.json().await
        .map_err(|e| format!("Error parseando respuesta de Adoptium: {}", e))?;

    let asset = assets.get(0).ok_or("Adoptium no devolvió ningún asset")?;
    let download_url = asset["binary"]["package"]["link"]
        .as_str().ok_or("No se encontró la URL de descarga")?.to_string();
    let file_size  = asset["binary"]["package"]["size"].as_u64().unwrap_or(0);
    let archive_name = asset["binary"]["package"]["name"]
        .as_str().unwrap_or("jre.archive").to_string();

    emit!("fetch", 100.0, "URL obtenida");

    // ── Descargar ──────────────────────────────────────────────────────────
    let runtimes_dir = PathBuf::from(&launcher_dir).join("runtimes");
    std::fs::create_dir_all(&runtimes_dir)
        .map_err(|e| format!("Error creando directorio runtimes: {}", e))?;
    let archive_path = runtimes_dir.join(&archive_name);

    emit!("download", 0.0, &format!("Descargando {}...", archive_name));

    let mut response = client.get(&download_url)
        .header("User-Agent", "Minecrack/1.0")
        .timeout(std::time::Duration::from_secs(600))
        .send().await
        .map_err(|e| format!("Error iniciando descarga: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Error descargando Java: HTTP {}", response.status()));
    }

    {
        let mut archive_file = std::fs::File::create(&archive_path)
            .map_err(|e| format!("Error creando archivo: {}", e))?;
        let mut downloaded: u64 = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            archive_file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if file_size > 0 {
                let pct = (downloaded as f64 / file_size as f64) * 100.0;
                emit!("download", pct, &format!("{:.1} MB / {:.1} MB",
                    downloaded as f64 / 1_048_576.0, file_size as f64 / 1_048_576.0));
            }
        }
    }
    emit!("download", 100.0, "Descarga completa");

    // ── Extraer ────────────────────────────────────────────────────────────
    emit!("extract", 0.0, "Extrayendo...");
    let java_dir = runtimes_dir.join(format!("java-{}", major_version));
    std::fs::create_dir_all(&java_dir)
        .map_err(|e| format!("Error creando directorio de destino: {}", e))?;

    if archive_name.ends_with(".zip") {
        let zip_file = std::fs::File::open(&archive_path)
            .map_err(|e| format!("Error abriendo ZIP: {}", e))?;
        let mut zip_archive = zip::ZipArchive::new(zip_file)
            .map_err(|e| format!("ZIP inválido: {}", e))?;
        let total = zip_archive.len();
        for i in 0..total {
            let mut entry = zip_archive.by_index(i)
                .map_err(|e| format!("Error leyendo ZIP: {}", e))?;
            let name = entry.name().to_string();
            let stripped = name.splitn(2, '/').nth(1).unwrap_or("").to_string();
            if stripped.is_empty() { continue; }
            let out_path = java_dir.join(&stripped);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).ok();
            } else {
                if let Some(p) = out_path.parent() { std::fs::create_dir_all(p).ok(); }
                let mut out_file = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Error creando {}: {}", stripped, e))?;
                std::io::copy(&mut entry, &mut out_file)
                    .map_err(|e| format!("Error extrayendo {}: {}", stripped, e))?;
            }
            if i % 50 == 0 {
                emit!("extract", (i as f64 / total as f64) * 100.0,
                    &format!("Extrayendo... {}/{}", i, total));
            }
        }
    } else {
        // tar.gz (Linux/Mac)
        let tar_gz = std::fs::File::open(&archive_path)
            .map_err(|e| format!("Error abriendo tar.gz: {}", e))?;
        let decompressed = GzDecoder::new(tar_gz);
        let mut archive = TarArchive::new(decompressed);
        for entry in archive.entries().map_err(|e| format!("Error leyendo tar: {}", e))? {
            let mut entry = entry.map_err(|e| format!("Error en entrada tar: {}", e))?;
            let entry_path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
            let mut components = entry_path.components();
            components.next();
            let stripped: PathBuf = components.collect();
            if stripped.as_os_str().is_empty() { continue; }
            entry.unpack(java_dir.join(&stripped)).ok();
        }
    }

    std::fs::remove_file(&archive_path).ok();
    emit!("extract", 100.0, "Extracción completa");

    #[cfg(target_os = "windows")]
    let java_exe = java_dir.join("bin").join("java.exe");
    #[cfg(not(target_os = "windows"))]
    let java_exe = java_dir.join("bin").join("java");

    if !java_exe.exists() {
        return Err(format!("No se encontró java en {}", java_exe.display()));
    }

    Ok(java_exe.to_string_lossy().to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Extrae un ZIP a un directorio
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn extract_zip(zip_path: String, dest_dir: String) -> Result<(), String> {
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("No se pudo abrir ZIP: {}", e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("No es un ZIP válido: {}", e))?;

    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("No se pudo crear directorio de destino: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Error leyendo archivo del ZIP: {}", e))?;

        let file_path = PathBuf::from(&dest_dir).join(file.name());

        // Saltar directorios
        if file.is_dir() {
            std::fs::create_dir_all(&file_path)
                .map_err(|e| format!("Error creando directorio: {}", e))?;
        } else {
            // Crear directorio padre si no existe
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Error creando directorio padre: {}", e))?;
            }

            // Extraer archivo
            let mut out_file = std::fs::File::create(&file_path)
                .map_err(|e| format!("Error creando archivo: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("Error extrayendo archivo: {}", e))?;
        }
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Verifica la integridad de una instancia
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub label: String,
    pub sha1: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerificationResult {
    pub status: String, // "ok", "incomplete", "corrupted"
    pub total: usize,
    pub missing: Vec<FileInfo>,
    pub corrupt: Vec<FileInfo>,
}

#[tauri::command]
async fn verify_instance(
    launcher_dir: String,
    instance_id: String,
) -> Result<VerificationResult, String> {
    let launcher_path = PathBuf::from(&launcher_dir);
    let instances_file = launcher_path.join("instances.json");

    // Leer instancia
    let instances_data = std::fs::read_to_string(&instances_file)
        .map_err(|e| format!("Error leyendo instances.json: {}", e))?;
    let instances: Vec<serde_json::Value> = serde_json::from_str(&instances_data)
        .map_err(|e| format!("Error parseando instances.json: {}", e))?;

    let instance = instances
        .iter()
        .find(|i| i["id"].as_str() == Some(&instance_id))
        .ok_or("Instancia no encontrada")?;

    let mc_version = instance["version"].as_str().unwrap_or("unknown");

    // Leer version.json
    let version_file = launcher_path
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));

    let version_data = std::fs::read_to_string(&version_file)
        .map_err(|e| format!("No se pudo leer version JSON: {}", e))?;
    let version_json: serde_json::Value = serde_json::from_str(&version_data)
        .map_err(|e| format!("Error parseando version JSON: {}", e))?;

    let mut files = Vec::new();
    let mut missing = Vec::new();
    let mut corrupt = Vec::new();

    // ── Client JAR (vanilla) ──────────────────────────────────────────────────
    if let Some(client_download) = version_json.get("downloads").and_then(|d| d.get("client")) {
        if let (Some(url), Some(sha1)) = (
            client_download.get("url").and_then(|u| u.as_str()),
            client_download.get("sha1").and_then(|s| s.as_str()),
        ) {
            let path = launcher_path
                .join("versions")
                .join(mc_version)
                .join(format!("{}.jar", mc_version));

            files.push(FileInfo {
                path: path.to_string_lossy().to_string(),
                label: format!("client.jar ({})", mc_version),
                sha1: Some(sha1.to_string()),
                url: Some(url.to_string()),
            });

            // Verificar
            if !check_file_sha1(&path, sha1) {
                if path.exists() {
                    corrupt.push(FileInfo {
                        path: path.to_string_lossy().to_string(),
                        label: format!("client.jar ({})", mc_version),
                        sha1: Some(sha1.to_string()),
                        url: Some(url.to_string()),
                    });
                } else {
                    missing.push(FileInfo {
                        path: path.to_string_lossy().to_string(),
                        label: format!("client.jar ({})", mc_version),
                        sha1: Some(sha1.to_string()),
                        url: Some(url.to_string()),
                    });
                }
            }
        }
    }

    // ── Libraries (vanilla) ──────────────────────────────────────────────────
    if let Some(libraries) = version_json.get("libraries").and_then(|l| l.as_array()) {
        for lib in libraries {
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                if let (Some(path_str), Some(url), Some(sha1)) = (
                    artifact.get("path").and_then(|p| p.as_str()),
                    artifact.get("url").and_then(|u| u.as_str()),
                    artifact.get("sha1").and_then(|s| s.as_str()),
                ) {
                    let lib_path = launcher_path.join("libraries").join(path_str);

                    files.push(FileInfo {
                        path: lib_path.to_string_lossy().to_string(),
                        label: lib.get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or(path_str)
                            .to_string(),
                        sha1: Some(sha1.to_string()),
                        url: Some(url.to_string()),
                    });

                    // Verificar
                    if !check_file_sha1(&lib_path, sha1) {
                        if lib_path.exists() {
                            corrupt.push(FileInfo {
                                path: lib_path.to_string_lossy().to_string(),
                                label: lib.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or(path_str)
                                    .to_string(),
                                sha1: Some(sha1.to_string()),
                                url: Some(url.to_string()),
                            });
                        } else {
                            missing.push(FileInfo {
                                path: lib_path.to_string_lossy().to_string(),
                                label: lib.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or(path_str)
                                    .to_string(),
                                sha1: Some(sha1.to_string()),
                                url: Some(url.to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    // ── Loader profile si no es vanilla ───────────────────────────────────────
    let loader = instance.get("loader").and_then(|l| l.as_str()).unwrap_or("vanilla");
    let loader_version = instance.get("loaderVersion").and_then(|lv| lv.as_str());

    if loader != "vanilla" && loader_version.is_some() {
        if let Ok(profile_id) = build_loader_profile_id(loader, loader_version.unwrap(), mc_version) {
            let profile_path = launcher_path
                .join("versions")
                .join(&profile_id)
                .join(format!("{}.json", profile_id));

            if let Ok(profile_data) = std::fs::read_to_string(&profile_path) {
                if let Ok(profile_json) = serde_json::from_str::<serde_json::Value>(&profile_data) {
                    // Procesar libraries del loader
                    if let Some(loader_libs) = profile_json.get("libraries").and_then(|l| l.as_array()) {
                        for lib in loader_libs {
                            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                                if let (Some(path_str), Some(url), Some(sha1)) = (
                                    artifact.get("path").and_then(|p| p.as_str()),
                                    artifact.get("url").and_then(|u| u.as_str()),
                                    artifact.get("sha1").and_then(|s| s.as_str()),
                                ) {
                                    let lib_path = launcher_path.join("libraries").join(path_str);

                                    files.push(FileInfo {
                                        path: lib_path.to_string_lossy().to_string(),
                                        label: format!("[{}] {}", loader,
                                            lib.get("name")
                                                .and_then(|n| n.as_str())
                                                .unwrap_or(path_str)),
                                        sha1: Some(sha1.to_string()),
                                        url: Some(url.to_string()),
                                    });

                                    // Verificar
                                    if !check_file_sha1(&lib_path, sha1) {
                                        if lib_path.exists() {
                                            corrupt.push(FileInfo {
                                                path: lib_path.to_string_lossy().to_string(),
                                                label: format!("[{}] {}", loader,
                                                    lib.get("name")
                                                        .and_then(|n| n.as_str())
                                                        .unwrap_or(path_str)),
                                                sha1: Some(sha1.to_string()),
                                                url: Some(url.to_string()),
                                            });
                                        } else {
                                            missing.push(FileInfo {
                                                path: lib_path.to_string_lossy().to_string(),
                                                label: format!("[{}] {}", loader,
                                                    lib.get("name")
                                                        .and_then(|n| n.as_str())
                                                        .unwrap_or(path_str)),
                                                sha1: Some(sha1.to_string()),
                                                url: Some(url.to_string()),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let status = if !corrupt.is_empty() {
        "corrupted".to_string()
    } else if !missing.is_empty() {
        "incomplete".to_string()
    } else {
        "ok".to_string()
    };

    Ok(VerificationResult {
        status,
        total: files.len(),
        missing,
        corrupt,
    })
}

// Helper: construir profile ID según el loader
fn build_loader_profile_id(loader: &str, loader_version: &str, mc_version: &str) -> Result<String, String> {
    match loader {
        "fabric" => Ok(format!("{}-fabric-{}", mc_version, loader_version)),
        "quilt" => Ok(format!("{}-quilt-{}", mc_version, loader_version)),
        "forge" | "neoforge" => Ok(loader_version.to_string()),
        _ => Err(format!("Loader desconocido: {}", loader)),
    }
}

// Helper: verificar SHA1 de un archivo
fn check_file_sha1(path: &PathBuf, expected_sha1: &str) -> bool {
    match std::fs::read(path) {
        Ok(data) => {
            let hash = format!("{:x}", Sha1::digest(&data));
            hash == expected_sha1.to_lowercase()
        }
        Err(_) => false,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Genera tareas de descarga para reparar una instancia
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn get_repair_tasks(
    launcher_dir: String,
    instance_id: String,
    fix_corrupt: bool,
) -> Result<Vec<DownloadTask>, String> {
    let verification = verify_instance(launcher_dir, instance_id).await?;
    let mut tasks = Vec::new();

    // Archivos faltantes
    for file in &verification.missing {
        if let Some(url) = &file.url {
            tasks.push(DownloadTask {
                url: url.clone(),
                dest: file.path.clone(),
                sha1: file.sha1.clone(),
                label: format!("[repair] {}", file.label),
            });
        }
    }

    // Archivos corruptos
    if fix_corrupt {
        for file in &verification.corrupt {
            if let Some(url) = &file.url {
                tasks.push(DownloadTask {
                    url: url.clone(),
                    dest: file.path.clone(),
                    sha1: file.sha1.clone(),
                    label: format!("[repair] {} (corrupted)", file.label),
                });
            }
        }
    }

    Ok(tasks)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    // ── parse_java_major ──────────────────────────────────────────────────────
    #[test]
    fn parse_java_major_modern() {
        assert_eq!(parse_java_major(r#"openjdk version "21.0.1" 2023-10-17"#), 21);
    }

    #[test]
    fn parse_java_major_java17() {
        assert_eq!(parse_java_major(r#"openjdk version "17.0.9" 2023-10-17"#), 17);
    }

    #[test]
    fn parse_java_major_java8_legacy() {
        assert_eq!(parse_java_major(r#"java version "1.8.0_392""#), 8);
    }

    #[test]
    fn parse_java_major_unknown_returns_zero() {
        assert_eq!(parse_java_major("garbage string no numbers"), 0);
    }

    // ── SHA1 ──────────────────────────────────────────────────────────────────
    #[test]
    fn sha1_digest_is_correct() {
        // SHA1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
        let data = b"abc";
        let hash = format!("{:x}", Sha1::digest(data));
        assert_eq!(hash, "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    // ── file_exists helper ────────────────────────────────────────────────────
    #[test]
    fn sha1_mismatch_detected() {
        let dir = std::env::temp_dir();
        let path = dir.join("minecrack_test_sha1.txt");
        std::fs::write(&path, b"hello world").unwrap();

        let data = std::fs::read(&path).unwrap();
        let hash = format!("{:x}", Sha1::digest(&data));
        // Correct hash must match
        assert!(hash == hash.to_lowercase());
        // Wrong hash must differ
        assert_ne!(hash, "0000000000000000000000000000000000000000");

        std::fs::remove_file(&path).ok();
    }

    // ── ModsZipManifest JSON round-trip ───────────────────────────────────────
    #[test]
    fn mods_zip_manifest_roundtrip() {
        let manifest = ModsZipManifest {
            minecrack_version: "0.1.0".to_string(),
            instance_name:     "Test".to_string(),
            mc_version:        "1.20.1".to_string(),
            loader:            "fabric".to_string(),
            loader_version:    Some("0.15.0".to_string()),
            mods: vec![
                ModsZipEntry { filename: "sodium.jar".to_string(), sha1: None, enabled: true },
            ],
        };
        let json = serde_json::to_string(&manifest).unwrap();
        let back: ModsZipManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mc_version, "1.20.1");
        assert_eq!(back.mods.len(), 1);
        assert_eq!(back.mods[0].filename, "sodium.jar");
    }

    // ── paths join sanity ─────────────────────────────────────────────────────
    #[test]
    fn mods_dir_path_builds_correctly() {
        let base = PathBuf::from("/home/user/.local/minecrack");
        let id   = "abc-123";
        let mods = base.join("instances").join(id).join("mods");
        assert!(mods.to_string_lossy().contains("instances"));
        assert!(mods.to_string_lossy().contains("mods"));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_launcher_dir,
            ensure_dir,
            write_file,
            read_file,
            file_exists,
            download_file,
            launch_game,
            detect_java,
            list_mods,
            delete_mod,
            toggle_mod,
            export_instance_mods,
            import_instance_mods,
            inspect_mods_zip,
            install_java_runtime,
            download_mod,
            verify_instance,
            get_repair_tasks,
            extract_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
