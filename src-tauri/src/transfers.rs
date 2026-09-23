use crate::{network, safe_fs, DownloadProgress};
use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::path::Path;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

fn cancellation() -> &'static tokio::sync::watch::Sender<u64> {
    static CANCEL: OnceLock<tokio::sync::watch::Sender<u64>> = OnceLock::new();
    CANCEL.get_or_init(|| tokio::sync::watch::channel(0).0)
}

#[tauri::command]
pub fn cancel_downloads() {
    cancellation().send_modify(|generation| *generation = generation.wrapping_add(1));
}

pub async fn download(
    window: &tauri::Window,
    url: &str,
    dest: &Path,
    sha1: Option<&str>,
    sha256: Option<&str>,
    expected_size: Option<u64>,
    label: &str,
) -> Result<(), String> {
    let url = network::provider_url(url)?;
    for (digest, length) in [(sha1, 40), (sha256, 64)] {
        if let Some(value) = digest {
            if value.len() != length || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err("Digest inválido".into());
            }
        }
    }
    if expected_size.is_some_and(|size| size > safe_fs::MAX_FILE) {
        return Err("Descarga demasiado grande".into());
    }
    let mut cancelled = cancellation().subscribe();
    let _lock = tokio::select! {
        lock = safe_fs::lock(dest) => lock,
        _ = cancelled.changed() => return Err("Descarga cancelada".into()),
    };
    safe_fs::no_links(dest)?;
    let parent = dest.parent().ok_or("Destino inválido")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let client = network::client()?;
    let mut error = String::new();
    for attempt in 0..3 {
        let result = async {
            let response = client
                .get(url.clone())
                .header("Accept-Encoding", "identity")
                .send()
                .await
                .map_err(|e| e.without_url().to_string())?
                .error_for_status()
                .map_err(|e| e.without_url().to_string())?;
            let declared = response.content_length();
            let limit = expected_size.unwrap_or(safe_fs::MAX_FILE);
            if declared.is_some_and(|size| size > limit) {
                return Err("Descarga supera el tamaño permitido".to_string());
            }
            let temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
            let mut file = tokio::fs::File::from_std(temp.reopen().map_err(|e| e.to_string())?);
            let mut body = response.bytes_stream();
            let mut received = 0_u64;
            let mut hash1 = Sha1::new();
            let mut hash256 = Sha256::new();
            let mut last_progress = Instant::now();
            while let Some(chunk) = body.next().await {
                let chunk = chunk.map_err(|e| e.without_url().to_string())?;
                received = received
                    .checked_add(chunk.len() as u64)
                    .ok_or("Tamaño inválido")?;
                if received > limit {
                    return Err("Descarga supera el tamaño permitido".into());
                }
                hash1.update(&chunk);
                hash256.update(&chunk);
                file.write_all(&chunk).await.map_err(|e| e.to_string())?;
                if last_progress.elapsed() >= Duration::from_millis(100) {
                    let total = expected_size.or(declared).unwrap_or(0);
                    let _ = window.emit(
                        "download://progress",
                        DownloadProgress {
                            file: label.into(),
                            received,
                            total,
                            percent: if total == 0 {
                                0.0
                            } else {
                                received as f64 / total as f64 * 100.0
                            },
                        },
                    );
                    last_progress = Instant::now();
                }
            }
            if expected_size
                .or(declared)
                .is_some_and(|size| size != received)
            {
                return Err("Tamaño de descarga incorrecto".into());
            }
            if sha1.is_some_and(|expected| {
                !format!("{:x}", hash1.finalize()).eq_ignore_ascii_case(expected)
            }) || sha256.is_some_and(|expected| {
                !format!("{:x}", hash256.finalize()).eq_ignore_ascii_case(expected)
            }) {
                return Err("Integridad de descarga incorrecta".into());
            }
            file.sync_all().await.map_err(|e| e.to_string())?;
            drop(file);
            safe_fs::no_links(dest)?;
            temp.persist(dest).map_err(|e| e.error.to_string())?;
            let _ = window.emit(
                "download://progress",
                DownloadProgress {
                    file: label.into(),
                    received,
                    total: received,
                    percent: 100.0,
                },
            );
            let _ = window.emit("download://done", label);
            Ok(())
        };
        match tokio::select! {
            result = result => result,
            _ = cancelled.changed() => return Err("Descarga cancelada".into()),
        } {
            Ok(()) => return Ok(()),
            Err(err) => error = err,
        }
        if attempt < 2 {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(1 << attempt)) => (),
                _ = cancelled.changed() => return Err("Descarga cancelada".into()),
            }
        }
    }
    Err(format!("Descarga fallida: {error}"))
}
