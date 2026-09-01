use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use futures_util::{stream, StreamExt, TryStreamExt};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u8,
    release: ManifestRelease,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestRelease {
    id: i64,
    version: String,
    minecraft_version: String,
    loader: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    file_name: String,
    sha256: String,
    size: u64,
    download_url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalFile {
    file_name: String,
    sha256: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyResponse {
    release_id: i64,
    missing: Vec<Difference>,
    corrupt: Vec<Difference>,
    extra: Vec<Difference>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Difference {
    file_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    phase: String,
    label: String,
    received_bytes: u64,
    total_bytes: u64,
    percent: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    release_id: i64,
    release_version: String,
    downloaded: usize,
    quarantined: usize,
    quarantine_path: Option<String>,
}

fn validate_instance_id(instance_id: &str) -> Result<(), String> {
    if instance_id.is_empty()
        || !instance_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("ID de instancia inválido".to_string());
    }
    Ok(())
}

fn emit_progress(window: &tauri::Window, phase: &str, label: &str, received: u64, total: u64) {
    let percent = if total == 0 {
        0.0
    } else {
        (received as f64 / total as f64) * 100.0
    };
    let _ = window.emit(
        "sync://progress",
        SyncProgress {
            phase: phase.to_string(),
            label: label.to_string(),
            received_bytes: received,
            total_bytes: total,
            percent,
        },
    );
}

fn validate_file(file: &ManifestFile) -> Result<(), String> {
    let path = Path::new(&file.file_name);
    if path.file_name().and_then(|name| name.to_str()) != Some(file.file_name.as_str())
        || !file.file_name.to_ascii_lowercase().ends_with(".jar")
        || file.file_name == "."
        || file.file_name == ".."
    {
        return Err(format!(
            "Nombre de archivo inseguro en manifiesto: {}",
            file.file_name
        ));
    }
    if file.sha256.len() != 64 || !file.sha256.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(format!("SHA-256 inválido para {}", file.file_name));
    }
    if file.size == 0 {
        return Err(format!("Tamaño inválido para {}", file.file_name));
    }
    Ok(())
}

fn validate_plain_jar_name(file_name: &str) -> Result<(), String> {
    let path = Path::new(file_name);
    if path.file_name().and_then(|name| name.to_str()) != Some(file_name)
        || !file_name.to_ascii_lowercase().ends_with(".jar")
    {
        return Err(format!("Nombre de archivo inseguro: {file_name}"));
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<(String, u64), String> {
    let file = File::open(path).map_err(|err| err.to_string())?;
    let size = file.metadata().map_err(|err| err.to_string())?.len();
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = reader.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok((format!("{:x}", hasher.finalize()), size))
}

async fn scan_mods(mods_dir: &Path) -> Result<Vec<LocalFile>, String> {
    let dir = mods_dir.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();
        if !dir.exists() {
            return Ok(files);
        }
        for entry in std::fs::read_dir(&dir).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            let path = entry.path();
            if !path.is_file()
                || path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| !value.eq_ignore_ascii_case("jar"))
                    .unwrap_or(true)
            {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            let (sha256, size) = sha256_file(&path)?;
            files.push(LocalFile {
                file_name,
                sha256,
                size,
            });
        }
        Ok(files)
    })
    .await
    .map_err(|err| err.to_string())?
}

fn validate_download_url(api_base: &Url, raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "URL de descarga inválida".to_string())?;
    let local_dev = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"));
    if url.scheme() != "https" && !(url.scheme() == "http" && local_dev) {
        return Err(
            "Las descargas deben usar HTTPS (HTTP solo se permite en localhost)".to_string(),
        );
    }
    if url.host_str() != api_base.host_str() {
        return Err("El host de descarga no coincide con el servidor del manifiesto".to_string());
    }
    Ok(url)
}

async fn download_to_staging(
    client: reqwest::Client,
    window: tauri::Window,
    api_base: Url,
    file: ManifestFile,
    staging_dir: PathBuf,
    aggregate: Arc<AtomicU64>,
    total: u64,
) -> Result<ManifestFile, String> {
    let url = validate_download_url(&api_base, &file.download_url)?;
    let response = client
        .get(url)
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} descargando {}",
            response.status(),
            file.file_name
        ));
    }
    let temp_path = staging_dir.join(&file.file_name);
    let mut handle = File::create(&temp_path).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.try_next().await.map_err(|err| err.to_string())? {
        handle.write_all(&chunk).map_err(|err| err.to_string())?;
        hasher.update(&chunk);
        size += chunk.len() as u64;
        let received =
            aggregate.fetch_add(chunk.len() as u64, Ordering::Relaxed) + chunk.len() as u64;
        emit_progress(&window, "download", &file.file_name, received, total);
    }
    handle.sync_all().map_err(|err| err.to_string())?;
    let actual = format!("{:x}", hasher.finalize());
    if actual != file.sha256.to_ascii_lowercase() || size != file.size {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!(
            "Integridad SHA-256/tamaño incorrecta para {}",
            file.file_name
        ));
    }
    Ok(file)
}

fn move_to_quarantine(source: &Path, quarantine: &Path) -> Result<(), String> {
    let file_name = source.file_name().ok_or("Ruta de cuarentena inválida")?;
    let destination = quarantine.join(file_name);
    std::fs::rename(source, destination).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sync_instance(
    window: tauri::Window,
    launcher_dir: String,
    instance_id: String,
    api_base_url: String,
    modpack_id: i64,
    tracking: String,
    release_id: Option<i64>,
    minecraft_version: String,
    loader: String,
) -> Result<SyncResult, String> {
    validate_instance_id(&instance_id)?;
    let mut api_base =
        Url::parse(api_base_url.trim_end_matches('/')).map_err(|_| "URL del servidor inválida")?;
    let local_dev = matches!(api_base.host_str(), Some("localhost") | Some("127.0.0.1"));
    if api_base.scheme() != "https" && !(api_base.scheme() == "http" && local_dev) {
        return Err("El servidor debe usar HTTPS (HTTP solo se permite en localhost)".to_string());
    }
    api_base.set_path("");
    api_base.set_query(None);
    api_base.set_fragment(None);

    let manifest_path = if tracking == "pinned" {
        let id = release_id.ok_or("Una instancia fijada requiere releaseId")?;
        format!("api/v1/modpacks/{}/releases/{}/manifest", modpack_id, id)
    } else if tracking == "active" {
        format!("api/v1/modpacks/{}/active/manifest", modpack_id)
    } else {
        return Err("tracking debe ser active o pinned".to_string());
    };
    let manifest_url = api_base
        .join(&manifest_path)
        .map_err(|err| err.to_string())?;
    let client = reqwest::Client::builder()
        .user_agent("Minecrack/1.3.1")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())?;
    emit_progress(&window, "manifest", "Consultando manifiesto oficial…", 0, 0);
    let response = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("El servidor respondió HTTP {}", response.status()));
    }
    let manifest: Manifest = response
        .json()
        .await
        .map_err(|err| format!("Manifiesto inválido: {err}"))?;
    if manifest.schema_version != 1 {
        return Err(format!(
            "Versión de manifiesto no compatible: {}",
            manifest.schema_version
        ));
    }
    if manifest.release.minecraft_version != minecraft_version || manifest.release.loader != loader
    {
        return Err(format!(
            "El modpack requiere Minecraft {} / {}, pero la instancia usa {} / {}",
            manifest.release.minecraft_version, manifest.release.loader, minecraft_version, loader
        ));
    }
    for file in &manifest.files {
        validate_file(file)?;
    }
    let mut names = std::collections::HashSet::new();
    if manifest
        .files
        .iter()
        .any(|file| !names.insert(file.file_name.to_ascii_lowercase()))
    {
        return Err("El manifiesto contiene nombres de archivo duplicados".to_string());
    }

    let instance_dir = PathBuf::from(&launcher_dir)
        .join("instances")
        .join(&instance_id);
    let mods_dir = instance_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|err| err.to_string())?;
    emit_progress(&window, "verify", "Calculando SHA-256 local…", 0, 0);
    let local_files = scan_mods(&mods_dir).await?;
    let verify_url = api_base
        .join(&format!("api/v1/releases/{}/verify", manifest.release.id))
        .map_err(|err| err.to_string())?;
    let verify_response = client
        .post(verify_url)
        .json(&serde_json::json!({ "files": local_files }))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !verify_response.status().is_success() {
        return Err(format!(
            "La verificación respondió HTTP {}",
            verify_response.status()
        ));
    }
    let differences: VerifyResponse = verify_response
        .json()
        .await
        .map_err(|err| err.to_string())?;
    if differences.release_id != manifest.release.id {
        return Err("La respuesta de verificación no corresponde a la release".to_string());
    }
    for difference in differences
        .missing
        .iter()
        .chain(differences.corrupt.iter())
        .chain(differences.extra.iter())
    {
        validate_plain_jar_name(&difference.file_name)?;
    }

    let manifest_by_name: HashMap<String, ManifestFile> = manifest
        .files
        .into_iter()
        .map(|file| (file.file_name.clone(), file))
        .collect();
    let needed_names: Vec<String> = differences
        .missing
        .iter()
        .chain(differences.corrupt.iter())
        .map(|item| item.file_name.clone())
        .collect();
    let needed: Vec<ManifestFile> = needed_names
        .iter()
        .map(|name| {
            manifest_by_name
                .get(name)
                .cloned()
                .ok_or_else(|| format!("El servidor solicitó un archivo desconocido: {name}"))
        })
        .collect::<Result<_, _>>()?;
    let total_bytes: u64 = needed.iter().map(|file| file.size).sum();
    let staging_dir = instance_dir.join(".minecrack-sync-staging");
    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir).map_err(|err| err.to_string())?;
    }
    std::fs::create_dir_all(&staging_dir).map_err(|err| err.to_string())?;
    let received = Arc::new(AtomicU64::new(0));
    let download_result: Result<Vec<_>, String> = stream::iter(needed.clone())
        .map(|file| {
            download_to_staging(
                client.clone(),
                window.clone(),
                api_base.clone(),
                file,
                staging_dir.clone(),
                received.clone(),
                total_bytes,
            )
        })
        .buffer_unordered(4)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect();
    if let Err(err) = download_result {
        let _ = std::fs::remove_dir_all(&staging_dir);
        return Err(err);
    }

    emit_progress(
        &window,
        "apply",
        "Aplicando archivos verificados…",
        total_bytes,
        total_bytes,
    );
    let quarantine_names: Vec<String> = differences
        .extra
        .iter()
        .chain(differences.corrupt.iter())
        .map(|item| item.file_name.clone())
        .collect();
    let quarantine_dir = instance_dir
        .join("quarantine")
        .join(chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string());
    if !quarantine_names.is_empty() {
        std::fs::create_dir_all(&quarantine_dir).map_err(|err| err.to_string())?;
    }
    let mut quarantined = 0;
    for name in &quarantine_names {
        let source = mods_dir.join(name);
        if source.is_file() {
            move_to_quarantine(&source, &quarantine_dir)?;
            quarantined += 1;
        }
    }
    for file in &needed {
        let source = staging_dir.join(&file.file_name);
        let destination = mods_dir.join(&file.file_name);
        if let Err(err) = std::fs::rename(&source, &destination) {
            let backup = quarantine_dir.join(&file.file_name);
            if backup.is_file() {
                let _ = std::fs::rename(&backup, &destination);
            }
            return Err(format!("No se pudo instalar {}: {}", file.file_name, err));
        }
    }
    let _ = std::fs::remove_dir_all(&staging_dir);
    emit_progress(
        &window,
        "done",
        "Instancia sincronizada",
        total_bytes,
        total_bytes,
    );
    Ok(SyncResult {
        release_id: manifest.release.id,
        release_version: manifest.release.version,
        downloaded: needed.len(),
        quarantined,
        quarantine_path: if quarantined > 0 {
            Some(quarantine_dir.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn restore_quarantine(
    launcher_dir: String,
    instance_id: String,
    quarantine_path: String,
) -> Result<usize, String> {
    validate_instance_id(&instance_id)?;
    let instance_dir = PathBuf::from(launcher_dir)
        .join("instances")
        .join(instance_id);
    let allowed_root = instance_dir.join("quarantine");
    let requested = PathBuf::from(quarantine_path);
    let allowed_canonical = allowed_root
        .canonicalize()
        .map_err(|_| "La carpeta de cuarentena ya no existe".to_string())?;
    let requested_canonical = requested
        .canonicalize()
        .map_err(|_| "La cuarentena seleccionada ya no existe".to_string())?;
    if !requested_canonical.starts_with(&allowed_canonical)
        || requested_canonical == allowed_canonical
    {
        return Err("Ruta de cuarentena fuera de la instancia".to_string());
    }
    let mods_dir = instance_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|err| err.to_string())?;
    let mut restored = 0;
    for entry in std::fs::read_dir(&requested_canonical).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let source = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !source.is_file() || validate_plain_jar_name(&file_name).is_err() {
            continue;
        }
        let destination = mods_dir.join(&file_name);
        if destination.exists() {
            return Err(format!(
                "No se puede restaurar {file_name}: ya existe en mods"
            ));
        }
        std::fs::rename(source, destination).map_err(|err| err.to_string())?;
        restored += 1;
    }
    if std::fs::read_dir(&requested_canonical)
        .map_err(|err| err.to_string())?
        .next()
        .is_none()
    {
        let _ = std::fs::remove_dir(&requested_canonical);
    }
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_instance() -> (PathBuf, String) {
        let id = format!(
            "sync-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        );
        let root = std::env::temp_dir().join(&id);
        std::fs::create_dir_all(&root).unwrap();
        (root, id)
    }

    #[test]
    fn rejects_traversal_and_non_jar_names() {
        for name in ["../evil.jar", "folder/evil.jar", "readme.txt"] {
            let file = ManifestFile {
                file_name: name.into(),
                sha256: "a".repeat(64),
                size: 1,
                download_url: "https://example.com/file".into(),
            };
            assert!(validate_file(&file).is_err());
        }
    }

    #[test]
    fn validates_instance_ids_and_manifest_metadata() {
        for valid in ["instance-1", "ABC123"] {
            assert!(validate_instance_id(valid).is_ok());
        }
        for invalid in ["", "../instance", "with/slash", "with_space"] {
            assert!(validate_instance_id(invalid).is_err());
        }
        let mut file = ManifestFile {
            file_name: "safe.jar".into(),
            sha256: "a".repeat(64),
            size: 1,
            download_url: "https://example.com/safe.jar".into(),
        };
        assert!(validate_file(&file).is_ok());
        file.sha256 = "bad".into();
        assert!(validate_file(&file).is_err());
        file.sha256 = "a".repeat(64);
        file.size = 0;
        assert!(validate_file(&file).is_err());
    }

    #[test]
    fn download_urls_require_secure_matching_hosts() {
        let api = Url::parse("https://packs.example.test").unwrap();
        assert!(validate_download_url(&api, "https://packs.example.test/file.jar").is_ok());
        assert!(validate_download_url(&api, "https://cdn.example.test/file.jar").is_err());
        assert!(validate_download_url(&api, "http://packs.example.test/file.jar").is_err());
        let local = Url::parse("http://localhost:8000").unwrap();
        assert!(validate_download_url(&local, "http://localhost:9000/file.jar").is_ok());
    }

    #[test]
    fn streams_sha256() {
        let path = std::env::temp_dir().join(format!("minecrack-sync-{}.jar", std::process::id()));
        std::fs::write(&path, b"abc").unwrap();
        let (hash, size) = sha256_file(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(size, 3);
    }

    #[tokio::test]
    async fn scans_only_jar_files() {
        let (root, _) = temp_instance();
        std::fs::write(root.join("one.jar"), b"abc").unwrap();
        std::fs::write(root.join("disabled.jar.disabled"), b"ignored").unwrap();
        std::fs::write(root.join("notes.txt"), b"ignored").unwrap();
        let files = scan_mods(&root).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "one.jar");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn restores_quarantine_and_rejects_paths_outside_instance() {
        let (launcher, instance_id) = temp_instance();
        let instance = launcher.join("instances").join(&instance_id);
        let quarantine = instance.join("quarantine").join("snapshot");
        std::fs::create_dir_all(&quarantine).unwrap();
        std::fs::write(quarantine.join("restored.jar"), b"jar").unwrap();
        let restored = restore_quarantine(
            launcher.to_string_lossy().into_owned(),
            instance_id.clone(),
            quarantine.to_string_lossy().into_owned(),
        )
        .await
        .unwrap();
        assert_eq!(restored, 1);
        assert!(instance.join("mods/restored.jar").is_file());

        let outside = launcher.join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        assert!(restore_quarantine(
            launcher.to_string_lossy().into_owned(),
            instance_id,
            outside.to_string_lossy().into_owned(),
        )
        .await
        .is_err());
        std::fs::remove_dir_all(launcher).unwrap();
    }
}
