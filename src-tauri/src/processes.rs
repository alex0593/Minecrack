use crate::{safe_fs, LaunchConfig};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

fn trusted() -> &'static Mutex<HashSet<PathBuf>> {
    static PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    PATHS.get_or_init(Default::default)
}
pub fn register_java(path: &Path) -> Result<(), String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.is_file() {
        return Err("Java no es un archivo".into());
    }
    trusted()
        .lock()
        .map_err(|_| "Registro de Java no disponible")?
        .insert(canonical);
    Ok(())
}
pub fn check_java(path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !trusted()
        .lock()
        .map_err(|_| "Registro de Java no disponible")?
        .contains(&canonical)
    {
        return Err("Java no está registrado; detecta o instala un runtime primero".into());
    }
    Ok(canonical)
}

pub async fn version(path: &Path) -> Result<String, String> {
    let mut command = tokio::process::Command::new(path);
    command
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let mut stdout = child.stdout.take().ok_or("Java sin stdout")?;
    let mut stderr = child.stderr.take().ok_or("Java sin stderr")?;
    let mut out = Vec::new();
    let mut err = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), async {
        let mut limited_out = tokio::io::AsyncReadExt::take(&mut stdout, 65536);
        let mut limited_err = tokio::io::AsyncReadExt::take(&mut stderr, 65536);
        let read_out = limited_out.read_to_end(&mut out);
        let read_err = limited_err.read_to_end(&mut err);
        tokio::try_join!(read_out, read_err)?;
        child.wait().await
    })
    .await
    .map_err(|_| "Java no respondió en 10 segundos")?
    .map_err(|e| e.to_string())?;
    let stdout_text = String::from_utf8_lossy(&out);
    Ok(String::from_utf8_lossy(&err)
        .lines()
        .next()
        .or_else(|| stdout_text.lines().next())
        .unwrap_or("")
        .to_string())
}

fn running() -> &'static Mutex<Option<tokio::sync::watch::Sender<bool>>> {
    static RUNNING: OnceLock<Mutex<Option<tokio::sync::watch::Sender<bool>>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}
struct RunGuard;
impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = running().lock() {
            *active = None;
        }
    }
}

pub fn is_running() -> bool {
    running()
        .lock()
        .map(|state| state.is_some())
        .unwrap_or(true)
}

#[tauri::command]
pub fn stop_game() -> Result<(), String> {
    if let Some(sender) = running()
        .lock()
        .map_err(|_| "Estado de proceso no disponible")?
        .as_ref()
    {
        let _ = sender.send(true);
    }
    Ok(())
}

fn validate(config: &LaunchConfig) -> Result<PathBuf, String> {
    let java = check_java(Path::new(&config.java_path))?;
    let root = safe_fs::root()?;
    safe_fs::beneath(&root.join("instances"), Path::new(&config.game_dir))?;
    if Path::new(&config.game_dir) == root.join("instances") {
        return Err("Falta instancia".into());
    }
    for entry in std::env::split_paths(&config.classpath) {
        safe_fs::managed(&entry)?;
    }
    if config.main_class.is_empty()
        || !config
            .main_class
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._$".contains(&b))
    {
        return Err("Clase principal inválida".into());
    }
    // Explicit JVM options only; deny -jar, @argfiles, agents and alternate classpaths.
    for arg in &config.jvm_args {
        if !(arg.starts_with("-Xmx")
            || arg.starts_with("-Xms")
            || arg.starts_with("-XX:")
            || arg.starts_with("-D"))
            || arg.contains(['\0', '\n', '\r'])
        {
            return Err("Opción JVM no permitida".into());
        }
    }
    Ok(java)
}

async fn logs<R: tokio::io::AsyncRead + Unpin>(
    input: R,
    window: tauri::Window,
    id: String,
    level: &'static str,
) {
    let mut reader = BufReader::new(input);
    let mut pending = Vec::new();
    loop {
        // Limit a line even when a mod never writes a newline.
        let mut line = Vec::new();
        match (&mut reader).take(8192).read_until(b'\n', &mut line).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                pending.push(serde_json::json!({"text": String::from_utf8_lossy(&line), "level": level, "runId": id}));
                if pending.len() >= 32 {
                    let _ = window.emit("game://logs", &pending);
                    pending.clear();
                    tokio::time::sleep(Duration::from_millis(100)).await;
                } else {
                    let _ = window.emit("game://log", pending.pop().unwrap());
                }
            }
        }
    }
}

pub async fn launch(window: tauri::Window, config: LaunchConfig) -> Result<(), String> {
    let java = validate(&config)?;
    let (stop, mut stopped) = tokio::sync::watch::channel(false);
    {
        let mut active = running()
            .lock()
            .map_err(|_| "Estado de proceso no disponible")?;
        if active.is_some() {
            return Err("Ya hay un juego iniciándose o ejecutándose".into());
        }
        *active = Some(stop);
    }
    let _guard = RunGuard;
    let run_id = uuid::Uuid::new_v4().to_string();
    let mut command = tokio::process::Command::new(java);
    command
        .args(&config.jvm_args)
        .arg("-cp")
        .arg(&config.classpath)
        .arg(&config.main_class)
        .args(&config.game_args)
        .current_dir(&config.game_dir)
        .env_remove("JAVA_TOOL_OPTIONS")
        .env_remove("JDK_JAVA_OPTIONS")
        .env_remove("_JAVA_OPTIONS")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("No se pudo iniciar Java: {e}"))?;
    let pid = child.id().ok_or("Proceso Java sin PID")?;
    let _ = window.emit(
        "game://started",
        serde_json::json!({"runId": run_id, "pid": pid}),
    );
    let stdout = tokio::spawn(logs(
        child.stdout.take().unwrap(),
        window.clone(),
        run_id.clone(),
        "info",
    ));
    let stderr = tokio::spawn(logs(
        child.stderr.take().unwrap(),
        window.clone(),
        run_id.clone(),
        "warn",
    ));
    let result = tokio::select! {
        status = child.wait() => status,
        _ = stopped.changed() => {
            #[cfg(unix)] unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
            #[cfg(windows)] {
                let tool = PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot no disponible")?).join("System32/taskkill.exe");
                let _ = tokio::process::Command::new(tool).args(["/PID", &pid.to_string(), "/T", "/F"]).status().await;
            }
            match tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
                Ok(result) => result,
                Err(_) => {
                    #[cfg(unix)] unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
                    let _ = child.kill().await;
                    child.wait().await
                }
            }
        }
    };
    // A child can retain a pipe after Java exits. Never wait indefinitely for logs.
    stdout.abort();
    stderr.abort();
    let _ = window.emit("game://stopped", serde_json::json!({"runId": run_id, "exitCode": result.as_ref().ok().and_then(|s| s.code()).unwrap_or(-1)}));
    result.map(|_| ()).map_err(|e| e.to_string())
}
