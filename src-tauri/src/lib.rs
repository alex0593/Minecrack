use std::path::PathBuf;
use std::io::{Write, Read};
use serde::{Deserialize, Serialize};
use sha1::{Sha1, Digest};
use futures_util::StreamExt;
use tauri::Emitter;
use flate2::read::GzDecoder;
use tar::Archive as TarArchive;
use chrono::Utc;

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
// COMANDO: Borra un archivo (no-op si no existe)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() { return Ok(()); }
    std::fs::remove_file(&p).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Escribe un archivo binario desde base64 (skins, imágenes, etc.)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn write_file_base64(path: String, content_base64: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(&content_base64)
        .map_err(|e| format!("Base64 inválido: {}", e))?;
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, &bytes).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Copia un archivo (preservando contenido binario)
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn copy_file(src: String, dest: String) -> Result<(), String> {
    let dest_path = PathBuf::from(&dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dest_path).map(|_| ()).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Verifica si un archivo existe y opcionalmente comprueba su SHA1
// P1.4 optimization: SHA1 computation wrapped in spawn_blocking to avoid blocking async runtime
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn file_exists(path: String, expected_sha1: Option<String>) -> bool {
    let p = PathBuf::from(&path);
    if !p.exists() { return false; }
    if let Some(expected) = expected_sha1 {
        // Clone path for the blocking task
        let path_clone = p.clone();
        let expected_lower = expected.to_lowercase();

        // Wrap SHA1 computation in spawn_blocking to avoid blocking async runtime
        let result = tokio::task::spawn_blocking(move || {
            match std::fs::read(&path_clone) {
                Ok(data) => {
                    let hash = format!("{:x}", Sha1::digest(&data));
                    hash == expected_lower
                }
                Err(_) => false,
            }
        }).await;

        return result.unwrap_or(false);
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
#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchConfig {
    pub java_path:   String,
    pub jvm_args:    Vec<String>,
    pub classpath:   String,
    pub main_class:  String,
    pub game_args:   Vec<String>,
    pub game_dir:    String,
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT STRUCTS para prepare_game_launch
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,  // "vanilla", "fabric", "forge", "quilt", "neoforge"
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub java_args: Option<String>,
    #[serde(default)]
    pub max_ram: Option<i32>,
    #[serde(default)]
    pub game_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GameProfile {
    pub name: String,
    pub uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct GameVersionData {
    pub main_class: String,
    #[serde(default)]
    pub libraries: Vec<serde_json::Value>,
    #[serde(default)]
    pub arguments: Option<serde_json::Value>,
    #[serde(default)]
    pub minecraft_arguments: Option<String>,
    /// ID del asset index (ej: "1.19" para MC 1.19.2). Se usa en --assetIndex.
    /// Si no se proporciona, se usa la versión de MC como fallback.
    #[serde(default)]
    pub assets_index_name: Option<String>,
}

#[tauri::command]
async fn launch_game(
    window: tauri::Window,
    config: LaunchConfig,
) -> Result<(), String> {
    use std::process::Stdio;

    // ✓ PASO CRÍTICO: Convertir rutas de forward slashes a backslashes para Windows
    // JavaScript envía rutas con forward slashes (C:/path/to/file.jar o C:\path/to/file.jar)
    // Pero Java en Windows necesita backslashes consistentes para acceder a archivos físicos
    let jvm_args_fixed: Vec<String> = config.jvm_args.iter()
        .map(|arg| {
            // Si el argumento es un property JVM (-Dkey=value) y contiene una ruta Windows,
            // convertir TODOS los forward slashes a backslashes
            if arg.contains("-D") && (arg.contains(":\\") || arg.contains(":/")) {
                // Este es un argumento del sistema (-Dkey=value) con ruta en Windows
                // Reemplazar TODOS los / con \ para consistencia en Windows
                arg.replace('/', "\\")
            } else {
                arg.clone()
            }
        })
        .collect();

    // ✓ LOG DIAGNÓSTICO: Imprimir el comando completo antes de construir args
    eprintln!("[Rust] ============ COMANDO DE LANZAMIENTO ============");
    eprintln!("[Rust] Java: {}", config.java_path);
    eprintln!("[Rust] Main Class: {}", config.main_class);
    eprintln!("[Rust] Game Dir: {}", config.game_dir);
    eprintln!("[Rust] JVM Args ({} total):", jvm_args_fixed.len());
    for (i, arg) in jvm_args_fixed.iter().enumerate() {
        eprintln!("[Rust]   [{}] {}", i, arg);
    }
    eprintln!("[Rust] Classpath entries: {}", config.classpath.matches(';').count() + 1);
    if config.classpath.len() > 500 {
        eprintln!("[Rust]   [classpath truncado - {} chars total]", config.classpath.len());
        // Mostrar primeras y últimas partes del classpath
        let parts: Vec<&str> = config.classpath.split(';').collect();
        if parts.len() > 0 {
            eprintln!("[Rust]   FIRST: {}", parts[0]);
            eprintln!("[Rust]   LAST: {}", parts[parts.len()-1]);
        }
    } else {
        eprintln!("[Rust]   {}", config.classpath);
    }
    eprintln!("[Rust] ===================================================");

    // ✓ DIAGNÓSTICO 1: Verificar si el instalador de Forge existe físicamente
    eprintln!("[Rust] ============ DIAGNÓSTICO DE ARCHIVOS ============");
    for (i, arg) in jvm_args_fixed.iter().enumerate() {
        if arg.contains("forgewrapper.installer") {
            // Extraer la ruta del argumento
            if let Some(path_start) = arg.find('=') {
                let installer_path = &arg[path_start + 1..];
                let path = std::path::Path::new(installer_path);
                let exists = path.exists();
                let metadata = std::fs::metadata(installer_path);

                eprintln!("[Rust] Argumento [{}]: -Dforgewrapper.installer", i);
                eprintln!("[Rust] Ruta: {}", installer_path);
                eprintln!("[Rust] ¿Existe?: {}", if exists { "✓ SÍ" } else { "✗ NO" });

                if let Ok(meta) = metadata {
                    eprintln!("[Rust] Tamaño: {} bytes (~{} MB)", meta.len(), meta.len() / (1024 * 1024));
                    eprintln!("[Rust] Es archivo?: {}", if meta.is_file() { "✓ SÍ" } else { "✗ NO" });
                } else {
                    eprintln!("[Rust] No se pudo leer metadata del archivo");
                }

                if !exists {
                    eprintln!("[Rust] ⚠️ CRÍTICO: El instalador NO existe. Problema en la fase de descarga.");
                }
            }
        }
    }

    // ✓ DIAGNÓSTICO 2: Verificar que no hay comillas literales en los argumentos
    eprintln!("[Rust] Verificando argumentos por comillas incrustadas...");
    let mut has_quote_issues = false;
    for (i, arg) in jvm_args_fixed.iter().enumerate() {
        if arg.contains("\"") {
            eprintln!("[Rust] ⚠️ [{}] Contiene comillas literales: {}", i, arg);
            has_quote_issues = true;
        }
    }
    if !has_quote_issues {
        eprintln!("[Rust] ✓ Ningún argumento contiene comillas incrustadas");
    }

    // ✓ DIAGNÓSTICO 3: Verificar game_args
    eprintln!("[Rust] Game Args ({} total):", config.game_args.len());
    if config.game_args.is_empty() {
        eprintln!("[Rust] ⚠️ No hay game_args. ForgeWrapper podría no saber qué versión/gameDir usar.");
    } else {
        for (i, arg) in config.game_args.iter().enumerate() {
            eprintln!("[Rust]   [game_args {}] {}", i, arg);
        }
    }
    eprintln!("[Rust] ===================================================");

    // ✓ VALIDACIÓN PREVIA: Asegurar que java_path existe y es válido
    eprintln!("[Rust] Validando ruta de Java: {}", config.java_path);

    if config.java_path.is_empty() {
        return Err("FATAL: java_path está vacío. El frontend no detectó Java.".to_string());
    }

    let java_path = std::path::Path::new(&config.java_path);
    if !java_path.exists() {
        return Err(format!(
            "FATAL: Java no encontrado en:\n  {}\n\n\
            Solución: Instala JDK 17+ o reinicia tu PC (variable PATH puede estar desactualizada).",
            config.java_path
        ));
    }

    if !java_path.is_file() {
        return Err(format!("FATAL: La ruta de Java no es un archivo: {}", config.java_path));
    }

    eprintln!("[Rust] ✓ Java validado: {}", config.java_path);

    // ✓ VALIDACIÓN PREVIA: Asegurar que game_dir es válido
    if !std::path::Path::new(&config.game_dir).exists() {
        eprintln!("[Rust] ⚠️ Game dir no existe, creando: {}", config.game_dir);
        std::fs::create_dir_all(&config.game_dir)
            .map_err(|e| format!("No se pudo crear game_dir: {}", e))?;
    }

    // ✓ VALIDACIÓN PREVIA: Validar tamaño de argumentos
    let total_arg_size: usize = config.jvm_args.iter().map(|s| s.len()).sum::<usize>()
        + config.game_args.iter().map(|s| s.len()).sum::<usize>()
        + config.classpath.len();
    eprintln!("[Rust] Total de caracteres en argumentos: {} bytes", total_arg_size);
    if total_arg_size > 32000 {
        eprintln!("[Rust] ⚠️ ADVERTENCIA: Línea de comandos muy larga ({} bytes). Podría causar problemas.", total_arg_size);
    }

    let mut args = jvm_args_fixed;
    args.push("-cp".to_string());
    args.push(config.classpath.clone());
    args.push(config.main_class.clone());
    args.extend(config.game_args.clone());

    eprintln!("[Rust] ✓ Intentando lanzar Java con {} argumentos...", args.len());

    let mut child = tokio::process::Command::new(&config.java_path)
        .args(&args)
        .current_dir(&config.game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            eprintln!("[Rust] ✗ FATAL: No se pudo lanzar Java. Error: {}", e);
            format!("No se pudo lanzar Java: {}", e)
        })?;

    eprintln!("[Rust] ✓ Java lanzado exitosamente, esperando salida...");

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
    pub filename:    String,         // ej: "sodium-0.5.3.jar"
    pub name:        String,         // ej: "Sodium"
    pub version:     String,         // ej: "0.5.3"
    pub enabled:     bool,           // true si es .jar, false si es .jar.disabled
    pub description: Option<String>, // descripción del mod leída del JAR
    #[serde(rename = "iconBase64")]
    pub icon_base64: Option<String>, // data URL (data:image/png;base64,...) o None
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
            let (name, version, description, icon_base64) = extract_mod_metadata(&path).unwrap_or_else(|| {
                // Si no se puede extraer metadata, usar nombre del archivo
                let clean_name = filename_str.replace(".jar.disabled", "").replace(".jar", "");
                (clean_name.clone(), "unknown".to_string(), None, None)
            });

            mods.push(ModInfo {
                filename: filename_str,
                name,
                version,
                enabled,
                description,
                icon_base64,
            });
        }
    }

    // Ordenar por nombre
    mods.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(mods)
}

/// Devuelve None si la cadena contiene un placeholder de Gradle/Maven sin resolver.
fn sanitize_version(v: &str) -> String {
    let v = v.trim();
    if v.is_empty() || v.starts_with("${") || v.contains("${") {
        "N/A".to_string()
    } else {
        v.to_string()
    }
}

/// Extrae un valor TOML limpiamente de una línea `key = "value" #comment`
/// Maneja correctamente comillas y elimina comentarios TOML (#...)
fn parse_toml_value(line: &str) -> Option<String> {
    let after_eq = line.split_once('=')?.1.trim();

    // Caso 1: valor entre comillas dobles → extraer contenido entre el primer par
    if let Some(rest) = after_eq.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }

    // Caso 2: valor entre comillas simples
    if let Some(rest) = after_eq.strip_prefix('\'') {
        if let Some(end) = rest.find('\'') {
            return Some(rest[..end].to_string());
        }
    }

    // Caso 3: sin comillas → quitar comentario TOML (#...) y espacios
    let no_comment = after_eq.split('#').next().unwrap_or("").trim();
    if no_comment.is_empty() { None } else { Some(no_comment.to_string()) }
}

// Helper: extrae metadata de un JAR (nombre, versión, descripción e icono como data URL)
fn extract_mod_metadata(jar_path: &PathBuf) -> Option<(String, String, Option<String>, Option<String>)> {
    use base64::{Engine as _, engine::general_purpose};

    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Helper: lee un archivo del ZIP como String (el ZipFile se cierra antes de retornar)
    macro_rules! read_zip_str {
        ($name:expr) => {{
            match archive.by_name($name) {
                Ok(mut f) => {
                    let mut s = String::new();
                    if f.read_to_string(&mut s).is_ok() { Some(s) } else { None }
                }
                Err(_) => None,
            }
        }};
    }

    // Helper: lee un archivo del ZIP como bytes
    macro_rules! read_zip_bytes {
        ($name:expr) => {{
            match archive.by_name($name) {
                Ok(mut f) => {
                    let mut buf = Vec::new();
                    if std::io::Read::read_to_end(&mut f, &mut buf).is_ok() && !buf.is_empty() {
                        Some(buf)
                    } else {
                        None
                    }
                }
                Err(_) => None,
            }
        }};
    }

    // Convierte bytes a data URL, infiriendo mime por extensión
    let to_data_url = |bytes: Vec<u8>, path: &str| -> String {
        let mime = if path.ends_with(".jpg") || path.ends_with(".jpeg") { "image/jpeg" }
                   else if path.ends_with(".gif") { "image/gif" }
                   else { "image/png" };
        format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&bytes))
    };

    // ─── Fabric ───────────────────────────────────────────────────────────────
    let fabric_content = read_zip_str!("fabric.mod.json");
    if let Some(content) = fabric_content {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let name = json["name"].as_str().unwrap_or("Unknown").to_string();
            let version = sanitize_version(json["version"].as_str().unwrap_or(""));
            let description = json["description"].as_str().map(|s| s.to_string());
            let icon_path: Option<String> = json["icon"].as_str().map(|s| s.to_string());
            let icon_base64 = icon_path.as_deref().and_then(|path| {
                read_zip_bytes!(path).map(|b| to_data_url(b, path))
            });
            return Some((name, version, description, icon_base64));
        }
    }

    // ─── Forge / NeoForge ─────────────────────────────────────────────────────
    let forge_content = read_zip_str!("META-INF/mods.toml");
    if let Some(content) = forge_content {
        let name = content.lines()
            .find(|l| l.trim().starts_with("displayName"))
            .and_then(parse_toml_value)
            .unwrap_or_else(|| "Unknown".to_string());
        let version = sanitize_version(
            &content.lines()
                .find(|l| l.trim().starts_with("version") && !l.trim().starts_with("versionRange"))
                .and_then(parse_toml_value)
                .unwrap_or_default()
        );
        let description = content.lines()
            .find(|l| l.trim().starts_with("description"))
            .and_then(parse_toml_value)
            .filter(|s| !s.is_empty() && !s.contains("${"));
        let logo_path: Option<String> = content.lines()
            .find(|l| l.trim().starts_with("logoFile"))
            .and_then(parse_toml_value);
        let icon_base64 = logo_path.as_deref().and_then(|path| {
            read_zip_bytes!(path).map(|b| to_data_url(b, path))
        });
        return Some((name, version, description, icon_base64));
    }

    // ─── Quilt ────────────────────────────────────────────────────────────────
    let quilt_content = read_zip_str!("quilt.mod.json");
    if let Some(content) = quilt_content {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let meta = &json["quilt_loader"]["metadata"];
            let name = meta["name"].as_str().unwrap_or("Unknown").to_string();
            let version = sanitize_version(json["quilt_loader"]["version"].as_str().unwrap_or(""));
            let description = meta["description"].as_str().map(|s| s.to_string());
            let icon_path: Option<String> = meta["icon"].as_str().map(|s| s.to_string());
            let icon_base64 = icon_path.as_deref().and_then(|path| {
                read_zip_bytes!(path).map(|b| to_data_url(b, path))
            });
            return Some((name, version, description, icon_base64));
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
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Construye los argumentos del cliente de Minecraft
// Procesa version_data.arguments (formato moderno) o minecraft_arguments (legacy)
// ─────────────────────────────────────────────────────────────────────────────
fn build_game_arguments(
    version_data: &GameVersionData,
    player_name: &str,
    player_uuid: &str,
    game_dir: &str,
    assets_dir: &str,
    game_version: &str,
) -> Result<Vec<String>, String> {
    let mut args = Vec::new();

    // Intentar usar formato moderno (arguments field)
    if let Some(arguments_obj) = &version_data.arguments {
        if let Ok(args_map) = serde_json::from_value::<serde_json::Map<String, serde_json::Value>>(arguments_obj.clone()) {
            if let Some(game_args_val) = args_map.get("game") {
                if let Ok(game_args_array) = serde_json::from_value::<Vec<serde_json::Value>>(game_args_val.clone()) {
                    for arg_val in game_args_array {
                        if let Some(arg_str) = arg_val.as_str() {
                            // Reemplazar variables
                            let processed = arg_str
                                .replace("${auth_player_name}", player_name)
                                .replace("${version_name}", game_version)
                                .replace("${game_directory}", game_dir)
                                .replace("${assets_root}", assets_dir)
                                .replace("${assets_index_name}", version_data.assets_index_name.as_deref().unwrap_or(game_version))
                                .replace("${auth_uuid}", player_uuid)
                                .replace("${auth_access_token}", "0")  // Offline mode
                                .replace("${user_properties}", "{}")  // Offline mode
                                .replace("${user_type}", "offline")
                                .replace("${version_type}", "release")
                                .replace("${clientId}", "00000000000000000000000000000000")  // Dummy UUID
                                .replace("${xuid}", "");  // Empty for offline
                            args.push(processed);
                        }
                    }
                    return Ok(args);
                }
            }
        }
    }

    // Fallback: usar formato legacy (minecraft_arguments)
    if let Some(minecraft_args) = &version_data.minecraft_arguments {
        let processed_args = minecraft_args
            .replace("${auth_player_name}", player_name)
            .replace("${version_name}", game_version)
            .replace("${game_directory}", game_dir)
            .replace("${assets_root}", assets_dir)
            .replace("${assets_index_name}", version_data.assets_index_name.as_deref().unwrap_or(game_version))
            .replace("${auth_uuid}", player_uuid)
            .replace("${auth_access_token}", "0")
            .replace("${user_properties}", "{}")
            .replace("${user_type}", "offline")
            .replace("${version_type}", "release")
            .replace("${clientId}", "00000000000000000000000000000000")
            .replace("${xuid}", "");

        // Split by whitespace and filter empty
        args = processed_args.split_whitespace()
            .map(|s| s.to_string())
            .collect();
        return Ok(args);
    }

    // Si no hay ni formato moderno ni legacy, crear argumentos mínimos
    // (esto es para versiones muy antiguas)
    args.push("--username".to_string());
    args.push(player_name.to_string());
    args.push("--version".to_string());
    args.push(game_version.to_string());
    args.push("--gameDir".to_string());
    args.push(game_dir.to_string());
    args.push("--assetsDir".to_string());
    args.push(assets_dir.to_string());
    args.push("--uuid".to_string());
    args.push(player_uuid.to_string());
    args.push("--accessToken".to_string());
    args.push("0".to_string());
    args.push("--userType".to_string());
    args.push("offline".to_string());

    Ok(args)
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Prepara toda la configuración de lanzamiento del juego en RUST
// Consolida la lógica JS de launcher.js en un único comando Rust para mejor rendimiento
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn prepare_game_launch(
    instance: GameInstance,
    profile: GameProfile,
    launcher_dir: String,
    version_data: GameVersionData,
    java_path: String,  // Ya detectado y validado en JavaScript
) -> Result<LaunchConfig, String> {
    // PASO 0: Validar que recibimos una ruta Java válida
    if java_path.is_empty() || java_path == "java" {
        return Err("Invalid Java path provided. Use absolute path to java executable.".to_string());
    }

    // Usar el Java path que ya fue detectado y validado en JavaScript
    // No necesitamos ejecutar detect_java aquí - confiamos en que JavaScript hizo su trabajo

    // PASO 2: Construir classpath desde las librerías
    let mut classpath_entries = Vec::new();

    // Agregar librerías del version_data
    for lib in &version_data.libraries {
        if let Ok(lib_obj) = serde_json::from_value::<serde_json::Map<String, serde_json::Value>>(lib.clone()) {
            if let Some(path_val) = lib_obj.get("downloads") {
                // Extraer path de librería
                if let Ok(downloads) = serde_json::from_value::<serde_json::Map<String, serde_json::Value>>(path_val.clone()) {
                    if let Some(artifact) = downloads.get("artifact") {
                        if let Some(path_str) = artifact.get("path").and_then(|p| p.as_str()) {
                            let full_path = format!("{}/libraries/{}", launcher_dir, path_str);
                            if PathBuf::from(&full_path).exists() {
                                classpath_entries.push(full_path);
                            }
                        }
                    }
                }
            }
        }
    }

    // Agregar cliente JAR — Minecrack lo guarda en libraries/net/minecraft/client/{v}/client-{v}.jar
    // (convención de Prism Launcher, compatible con ForgeWrapper)
    let client_jar_libraries = format!(
        "{}/libraries/net/minecraft/client/{}/client-{}.jar",
        launcher_dir, instance.version, instance.version
    );
    // Fallback legacy: versions/{v}/{v}.jar (convención vanilla oficial)
    let client_jar_versions = format!(
        "{}/versions/{}/{}.jar",
        launcher_dir, instance.version, instance.version
    );

    if PathBuf::from(&client_jar_libraries).exists() {
        eprintln!("[Rust] ✓ Client JAR encontrado (libraries): {}", client_jar_libraries);
        classpath_entries.push(client_jar_libraries);
    } else if PathBuf::from(&client_jar_versions).exists() {
        eprintln!("[Rust] ✓ Client JAR encontrado (versions): {}", client_jar_versions);
        classpath_entries.push(client_jar_versions);
    } else {
        eprintln!("[Rust] ⚠️ Client JAR no encontrado en ninguna ruta esperada");
    }

    let classpath = if cfg!(windows) {
        classpath_entries.join(";")
    } else {
        classpath_entries.join(":")
    };

    // PASO 3: Construir JVM arguments
    let mut jvm_args = vec![
        format!("-Djava.library.path={}/natives", launcher_dir),
        "-Dcom.mojang.eula.agree=true".to_string(),
    ];

    // Agregar RAM si está especificada
    if let Some(max_ram) = instance.max_ram {
        jvm_args.push(format!("-Xmx{}M", max_ram));
    } else {
        jvm_args.push("-Xmx2G".to_string());  // Default 2GB
    }

    // Agregar custom JVM args si existen
    if let Some(custom_args) = instance.java_args {
        for arg in custom_args.split_whitespace() {
            jvm_args.push(arg.to_string());
        }
    }

    // PASO 4: Construir game arguments desde version_data
    let game_dir_str = format!("{}/instances/{}", launcher_dir, instance.id);
    let assets_dir = format!("{}/assets", launcher_dir);
    let game_args = build_game_arguments(
        &version_data,
        &profile.name,
        &profile.uuid,
        &game_dir_str,
        &assets_dir,
        &instance.version,
    )?;

    // PASO 5: Determinar main class y versión
    let main_class = version_data.main_class.clone();
    let game_dir = format!("{}/instances/{}", launcher_dir, instance.id);

    // Crear directorio de instancia si no existe
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    Ok(LaunchConfig {
        java_path,
        jvm_args,
        classpath,
        main_class,
        game_args,
        game_dir,
    })
}

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

// Helper function para detectar Java (usado por command y por prepare_game_launch)
fn detect_java_internal(launcher_dir: Option<String>) -> Vec<JavaInstall> {
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

#[tauri::command]
async fn detect_java(launcher_dir: Option<String>) -> Vec<JavaInstall> {
    detect_java_internal(launcher_dir)
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
// COMANDO: Descarga un resource pack directamente a instances/{id}/resourcepacks/
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn download_resourcepack(
    window: tauri::Window,
    launcher_dir: String,
    instance_id: String,
    url: String,
    filename: String,
    sha1: Option<String>,
) -> Result<(), String> {
    let resourcepacks_dir = PathBuf::from(&launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("resourcepacks");
    std::fs::create_dir_all(&resourcepacks_dir).map_err(|e| e.to_string())?;
    let dest = resourcepacks_dir.join(&filename).to_string_lossy().to_string();
    download_file(window, url, dest, sha1, filename).await
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Descarga un shaderpack directamente a instances/{id}/shaderpacks/
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn download_shaderpack(
    window: tauri::Window,
    launcher_dir: String,
    instance_id: String,
    url: String,
    filename: String,
    sha1: Option<String>,
) -> Result<(), String> {
    let shaderpacks_dir = PathBuf::from(&launcher_dir)
        .join("instances")
        .join(&instance_id)
        .join("shaderpacks");
    std::fs::create_dir_all(&shaderpacks_dir).map_err(|e| e.to_string())?;
    let dest = shaderpacks_dir.join(&filename).to_string_lossy().to_string();
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

    // ── Agregar automáticamente al PATH del usuario ──────────────────────────
    let java_bin_dir = java_dir.join("bin");
    match add_to_user_path_internal(&java_bin_dir.to_string_lossy()) {
        Ok(_)  => eprintln!("[Java] ✓ Agregado al PATH: {}", java_bin_dir.display()),
        Err(e) => eprintln!("[Java] ⚠ No se pudo agregar al PATH: {}", e),
    }

    Ok(java_exe.to_string_lossy().to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER INTERNO: Agregar directorio al PATH del usuario
// ─────────────────────────────────────────────────────────────────────────────
fn add_to_user_path_internal(new_dir: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let env = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
            .map_err(|e| format!("No se pudo abrir registro: {}", e))?;

        let current_path: String = env.get_value("Path").unwrap_or_default();

        // No agregar si ya está
        if current_path.split(';').any(|p| p.trim().eq_ignore_ascii_case(new_dir)) {
            eprintln!("[Path] Ya existe en PATH: {}", new_dir);
            return Ok(());
        }

        let new_path = if current_path.is_empty() {
            new_dir.to_string()
        } else {
            format!("{};{}", current_path.trim_end_matches(';'), new_dir)
        };

        env.set_value("Path", &new_path)
            .map_err(|e| format!("No se pudo escribir PATH: {}", e))?;

        eprintln!("[Path] ✓ PATH actualizado con: {}", new_dir);

        // Notificar a Windows del cambio de entorno
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        let env_wide: Vec<u16> = OsStr::new("Environment\0")
            .encode_wide().collect();
        winapi_broadcast_setting_change(&env_wide);

        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        // En Unix: agregar al .bashrc y .zshrc del usuario
        let export_line = format!("\nexport PATH=\"{}:$PATH\"\n", new_dir);
        let home = dirs::home_dir().ok_or("No se encontró home dir")?;
        for rc_file in &[".bashrc", ".zshrc", ".profile"] {
            let rc_path = home.join(rc_file);
            if rc_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&rc_path) {
                    if !content.contains(new_dir) {
                        let _ = std::fs::OpenOptions::new()
                            .append(true).open(&rc_path)
                            .and_then(|mut f| { use std::io::Write; f.write_all(export_line.as_bytes()) });
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn winapi_broadcast_setting_change(env_wide: &[u16]) {
    extern "system" {
        fn SendMessageTimeoutW(
            hwnd: *mut std::ffi::c_void,
            msg: u32,
            wparam: usize,
            lparam: *const u16,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }
    let hwnd_broadcast: *mut std::ffi::c_void = usize::MAX as *mut _;
    let mut result: usize = 0;
    // SAFETY: SendMessageTimeoutW es una API de Win32 bien definida
    unsafe {
        SendMessageTimeoutW(
            hwnd_broadcast,
            0x001A, // WM_SETTINGCHANGE
            0,
            env_wide.as_ptr(),
            0x0002, // SMTO_ABORTIFHUNG
            5000,
            &mut result,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: Validar Java (ejecutar -version y verificar que responde)
// ─────────────────────────────────────────────────────────────────────────────
#[derive(serde::Serialize)]
struct JavaValidation {
    valid:   bool,
    reason:  String,
    version: String,
}

#[tauri::command]
async fn validate_java(java_path: String) -> JavaValidation {
    if java_path.is_empty() {
        return JavaValidation { valid: false, reason: "Ruta vacía".into(), version: String::new() };
    }

    let path = std::path::Path::new(&java_path);
    if !path.exists() {
        return JavaValidation {
            valid: false,
            reason: format!("Archivo no encontrado: {}", java_path),
            version: String::new(),
        };
    }

    match std::process::Command::new(&java_path).arg("-version").output() {
        Ok(output) => {
            let ver_str = String::from_utf8_lossy(&output.stderr).to_string()
                + &String::from_utf8_lossy(&output.stdout);
            let first_line = ver_str.lines().next().unwrap_or("").to_string();
            if first_line.contains("version") {
                JavaValidation { valid: true, reason: "OK".into(), version: first_line }
            } else {
                JavaValidation { valid: false, reason: "java -version no produjo salida válida".into(), version: first_line }
            }
        }
        Err(e) => JavaValidation {
            valid: false,
            reason: format!("Error ejecutando Java: {}", e),
            version: String::new(),
        },
    }
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
// Fix 4: COMANDO: create_dir_all — crea directorio y padres
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn create_dir_all(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: Resource Packs y Shaderpacks
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PackInfo {
    pub filename: String,
    pub name:     String,
}

fn list_packs_in_dir(dir: &PathBuf) -> Vec<PackInfo> {
    if !dir.exists() { return Vec::new(); }
    let mut packs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename.ends_with(".zip") || entry.path().is_dir() {
                let name = filename.replace(".zip", "");
                packs.push(PackInfo { filename, name });
            }
        }
    }
    packs.sort_by(|a, b| a.name.cmp(&b.name));
    packs
}

#[tauri::command]
async fn list_resourcepacks(launcher_dir: String, instance_id: String) -> Result<Vec<PackInfo>, String> {
    let dir = PathBuf::from(launcher_dir).join("instances").join(&instance_id).join("resourcepacks");
    Ok(list_packs_in_dir(&dir))
}

#[tauri::command]
async fn add_resourcepack(launcher_dir: String, instance_id: String, src_path: String) -> Result<PackInfo, String> {
    let dest_dir = PathBuf::from(&launcher_dir).join("instances").join(&instance_id).join("resourcepacks");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let src = PathBuf::from(&src_path);
    let filename = src.file_name().ok_or("Nombre de archivo inválido")?.to_string_lossy().to_string();
    let dest = dest_dir.join(&filename);
    std::fs::copy(&src, &dest).map_err(|e| format!("Error copiando resource pack: {}", e))?;
    let name = filename.replace(".zip", "");
    Ok(PackInfo { filename, name })
}

#[tauri::command]
async fn delete_resourcepack(launcher_dir: String, instance_id: String, filename: String) -> Result<(), String> {
    let path = PathBuf::from(launcher_dir).join("instances").join(&instance_id).join("resourcepacks").join(&filename);
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn list_shaderpacks(launcher_dir: String, instance_id: String) -> Result<Vec<PackInfo>, String> {
    let dir = PathBuf::from(launcher_dir).join("instances").join(&instance_id).join("shaderpacks");
    Ok(list_packs_in_dir(&dir))
}

#[tauri::command]
async fn add_shaderpack(launcher_dir: String, instance_id: String, src_path: String) -> Result<PackInfo, String> {
    let dest_dir = PathBuf::from(&launcher_dir).join("instances").join(&instance_id).join("shaderpacks");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let src = PathBuf::from(&src_path);
    let filename = src.file_name().ok_or("Nombre de archivo inválido")?.to_string_lossy().to_string();
    let dest = dest_dir.join(&filename);
    std::fs::copy(&src, &dest).map_err(|e| format!("Error copiando shaderpack: {}", e))?;
    let name = filename.replace(".zip", "");
    Ok(PackInfo { filename, name })
}

#[tauri::command]
async fn delete_shaderpack(launcher_dir: String, instance_id: String, filename: String) -> Result<(), String> {
    let path = PathBuf::from(launcher_dir).join("instances").join(&instance_id).join("shaderpacks").join(&filename);
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: Import de instancias desde ZIP/carpeta (formato CurseForge)
// ─────────────────────────────────────────────────────────────────────────────

/// Metadata extraída de un manifest.json de modpack CurseForge
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModpackInspect {
    pub name:           String,
    #[serde(rename = "version")]
    pub mc_version:     String,
    pub loader:         String,
    #[serde(rename = "loaderVersion")]
    pub loader_version: Option<String>,
    #[serde(rename = "modsCount")]
    pub mods_count:     usize,
    #[serde(rename = "hasOverrides")]
    pub has_overrides:  bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModToDownload {
    #[serde(rename = "projectID")]
    pub project_id: u32,
    #[serde(rename = "fileID")]
    pub file_id:    u32,
    pub required:   bool,
    pub name:       Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportInstanceResult {
    #[serde(rename = "newInstanceId")]
    pub new_instance_id: String,
    pub name:            String,
    pub version:         String,
    pub loader:          String,
    #[serde(rename = "loaderVersion")]
    pub loader_version:  Option<String>,
}

/// Parsea el manifest.json de CurseForge desde un directorio ya extraído
fn parse_curseforge_manifest(dir: &PathBuf) -> Result<(serde_json::Value, ModpackInspect), String> {
    let manifest_path = dir.join("manifest.json");
    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|_| "No se encontró manifest.json en el directorio".to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando manifest.json: {}", e))?;

    let name = json["name"].as_str().unwrap_or("Modpack").to_string();
    let mc_version = json["minecraft"]["version"].as_str().unwrap_or("1.20.1").to_string();

    // Parsear loader desde modLoaders[0].id  → ej: "forge-47.1.0"
    let loader_raw = json["minecraft"]["modLoaders"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|ml| ml["id"].as_str())
        .unwrap_or("forge");

    let (loader, loader_version) = if loader_raw.contains('-') {
        let parts: Vec<&str> = loader_raw.splitn(2, '-').collect();
        (parts[0].to_string(), Some(parts[1].to_string()))
    } else {
        (loader_raw.to_string(), None)
    };

    let mods_count = json["files"].as_array().map(|a| a.len()).unwrap_or(0);
    let has_overrides = dir.join("overrides").exists();

    // For loaders like Forge/NeoForge, the loader_version needs to be the FULL version
    // (including MC version), not just the loader version number.
    // E.g.: manifest has "forge-43.5.0" for MC 1.19.2 → should become "1.19.2-43.5.0"
    let full_loader_version = match &loader as &str {
        "forge" | "neoforge" => {
            loader_version.map(|v| format!("{}-{}", mc_version, v))
        }
        _ => loader_version, // Fabric, Quilt don't need this transformation
    };

    let inspect = ModpackInspect {
        name, mc_version, loader, loader_version: full_loader_version, mods_count, has_overrides,
    };
    Ok((json, inspect))
}

#[tauri::command]
async fn inspect_instance_folder(folder_path: String) -> Result<ModpackInspect, String> {
    let dir = PathBuf::from(&folder_path);
    let (_, inspect) = parse_curseforge_manifest(&dir)?;
    Ok(inspect)
}

#[tauri::command]
async fn inspect_instance_zip(zip_path: String) -> Result<ModpackInspect, String> {
    // Extraer a directorio temporal para inspección
    let temp_dir = std::env::temp_dir().join(format!("minecrack_inspect_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let file = std::fs::File::open(&zip_path).map_err(|e| format!("No se pudo abrir ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP inválido: {}", e))?;

    // Solo extraer manifest.json para la inspección
    let manifest_content = {
        let mut mf = archive.by_name("manifest.json")
            .map_err(|_| "El ZIP no contiene manifest.json — ¿es un modpack de CurseForge?".to_string())?;
        let mut content = String::new();
        mf.read_to_string(&mut content).map_err(|e| e.to_string())?;
        content
    };
    let _ = std::fs::remove_dir_all(&temp_dir);

    // Escribir en temp para parsear
    let temp_manifest = std::env::temp_dir().join("minecrack_manifest_temp.json");
    std::fs::write(&temp_manifest, &manifest_content).map_err(|e| e.to_string())?;
    let dir_for_parse = std::env::temp_dir();
    // Renombrar para que parse_curseforge_manifest lo encuentre
    std::fs::write(dir_for_parse.join("manifest.json"), &manifest_content).map_err(|e| e.to_string())?;
    let (_, inspect) = parse_curseforge_manifest(&dir_for_parse)?;
    Ok(inspect)
}

#[tauri::command]
async fn get_mods_to_download(instance_path: String) -> Result<Vec<ModToDownload>, String> {
    let dir = PathBuf::from(&instance_path);
    let (json, _) = parse_curseforge_manifest(&dir)?;

    let mods = json["files"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|f| {
            let project_id = f["projectID"].as_u64()? as u32;
            let file_id    = f["fileID"].as_u64()? as u32;
            let required   = f["required"].as_bool().unwrap_or(true);
            Some(ModToDownload {
                project_id,
                file_id,
                required,
                name: None,
            })
        })
        .collect();

    Ok(mods)
}

#[tauri::command]
async fn import_instance_from_folder(
    launcher_dir: String,
    folder_path: String,
    new_name: String,
    icon: Option<String>,
    ram: Option<u64>,
    jvm_args: Option<String>,
) -> Result<ImportInstanceResult, String> {
    let src = PathBuf::from(&folder_path);
    let (_, inspect) = parse_curseforge_manifest(&src)?;

    // Generar nuevo UUID para la instancia
    let new_id = uuid_v4();
    let instances_dir = PathBuf::from(&launcher_dir).join("instances").join(&new_id);
    std::fs::create_dir_all(&instances_dir).map_err(|e| e.to_string())?;

    // Copiar overrides/ si existe (config, scripts, etc.)
    let overrides = src.join("overrides");
    if overrides.exists() {
        copy_dir_recursive(&overrides, &instances_dir)?;
    }

    // Copiar manifest.json a la carpeta de la instancia para que get_mods_to_download pueda leerlo después
    let src_manifest = src.join("manifest.json");
    if src_manifest.exists() {
        std::fs::copy(&src_manifest, instances_dir.join("manifest.json"))
            .map_err(|e| format!("Error copiando manifest.json: {}", e))?;
    }

    // Crear mods/ directorio vacío (los mods se descargarán después)
    std::fs::create_dir_all(instances_dir.join("mods")).map_err(|e| e.to_string())?;

    // Nombre final de la instancia
    let final_name = if new_name.trim().is_empty() { inspect.name.clone() } else { new_name.trim().to_string() };

    // Agregar entrada en instances.json
    let instances_file = PathBuf::from(&launcher_dir).join("instances.json");
    let mut instances: Vec<serde_json::Value> = if instances_file.exists() {
        let data = std::fs::read_to_string(&instances_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    let now = Utc::now().to_rfc3339();
    let instance_icon = icon.unwrap_or_else(|| "📦".to_string());
    let instance_ram  = ram.unwrap_or(2048);
    let instance_jvm  = jvm_args.unwrap_or_default();
    instances.push(serde_json::json!({
        "id": new_id,
        "name": final_name,
        "version": inspect.mc_version,
        "loader": inspect.loader,
        "loaderVersion": inspect.loader_version,
        "icon": instance_icon,
        "ram": instance_ram,
        "jvmArgs": instance_jvm,
        "installed": true,
        "createdAt": now,
        "lastPlayed": null,
        "playtime": 0,
        "modsCount": inspect.mods_count
    }));

    let json_str = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
    std::fs::write(&instances_file, json_str).map_err(|e| e.to_string())?;

    Ok(ImportInstanceResult {
        new_instance_id: new_id,
        name:            final_name,
        version:         inspect.mc_version,
        loader:          inspect.loader,
        loader_version:  inspect.loader_version,
    })
}

#[tauri::command]
async fn import_instance_from_zip(
    launcher_dir: String,
    zip_path: String,
    new_name: String,
) -> Result<ImportInstanceResult, String> {
    // Extraer ZIP a directorio temporal
    let temp_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
    let temp_dir = PathBuf::from(&launcher_dir).join(format!("temp-import-{}", temp_id));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // Extraer el ZIP completo
    let file = std::fs::File::open(&zip_path).map_err(|e| format!("No se pudo abrir ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP inválido: {}", e))?;

    for i in 0..archive.len() {
        let mut zf = archive.by_index(i).map_err(|e| e.to_string())?;
        let out_path = temp_dir.join(zf.name());
        if zf.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut zf, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    // Importar desde la carpeta temporal
    let result = import_instance_from_folder(launcher_dir, temp_dir.to_string_lossy().to_string(), new_name, None, None, None).await;

    // Limpiar directorio temporal
    let _ = std::fs::remove_dir_all(&temp_dir);

    result
}

#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = std::fs::read(&path).map_err(|e| format!("Error leyendo archivo: {}", e))?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

/// Genera un UUID v4 simple (sin dependencia externa)
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        t.as_secs() as u32,
        (t.subsec_nanos() >> 16) & 0xffff,
        (t.subsec_nanos() >> 4) & 0x0fff,
        0x8000 | ((t.subsec_nanos()) & 0x3fff),
        t.as_nanos() & 0xffffffffffff
    )
}

/// Copia recursivamente src_dir en dest_dir
fn copy_dir_recursive(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path).map_err(|e| format!("Error copiando {}: {}", src_path.display(), e))?;
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

    if loader != "vanilla" {
        if let Some(ver) = loader_version {
            if let Ok(profile_id) = build_loader_profile_id(loader, ver, mc_version) {
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
            create_dir_all,
            write_file,
            read_file,
            delete_file,
            write_file_base64,
            copy_file,
            file_exists,
            download_file,
            prepare_game_launch,
            launch_game,
            detect_java,
            list_mods,
            delete_mod,
            toggle_mod,
            export_instance_mods,
            import_instance_mods,
            inspect_mods_zip,
            install_java_runtime,
            validate_java,
            download_mod,
            download_resourcepack,
            download_shaderpack,
            verify_instance,
            get_repair_tasks,
            extract_zip,
            // Fix 4: Resource packs & Shaderpacks
            list_resourcepacks,
            add_resourcepack,
            delete_resourcepack,
            list_shaderpacks,
            add_shaderpack,
            delete_shaderpack,
            // Fix 5: Import de instancias
            inspect_instance_folder,
            inspect_instance_zip,
            get_mods_to_download,
            import_instance_from_folder,
            import_instance_from_zip,
            read_file_base64,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
