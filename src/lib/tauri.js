/**
 * tauri.js — Wrapper seguro para todos los comandos Tauri (IPC)
 *
 * Detecta si estamos dentro de Tauri o en el browser (dev web),
 * y proporciona mocks en el segundo caso para no romper la UI.
 *
 * Uso:
 *   import { tauriCmd, tauriListen } from './tauri';
 *   const dir = await tauriCmd('get_launcher_dir');
 *   const unlisten = await tauriListen('download://progress', handler);
 */

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ─── invoke ──────────────────────────────────────────────────────────────────
export async function tauriCmd(command, args = {}) {
  if (!IS_TAURI) {
    console.warn(`[mock] tauriCmd("${command}", ${JSON.stringify(args)})`);
    return mockCommand(command, args);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

// ─── listen ──────────────────────────────────────────────────────────────────
export async function tauriListen(event, handler) {
  if (!IS_TAURI) {
    console.warn(`[mock] tauriListen("${event}")`);
    return () => {}; // unlisten noop
  }
  const { listen } = await import('@tauri-apps/api/event');
  return listen(event, (e) => handler(e.payload));
}

// ─────────────────────────────────────────────────────────────────────────────
// Comandos tipados — Usar estos en lugar de tauriCmd directamente
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve el directorio base del launcher (~/.local/share/minecrack o %APPDATA%/minecrack) */
export const getLauncherDir = () => tauriCmd('get_launcher_dir');

/** Crea un directorio (y sus padres) si no existe */
export const ensureDir = (path) => tauriCmd('ensure_dir', { path });

/** Escribe contenido string en un archivo */
export const writeFile = (path, content) => tauriCmd('write_file', { path, content });

/** Lee un archivo y retorna su contenido como string */
export const readFile = async (path) => {
  try {
    return await tauriCmd('read_file', { path });
  } catch (err) {
    throw new Error(`No se pudo leer ${path}: ${err?.message || err?.toString?.() || 'error desconocido'}`);
  }
};

/**
 * Verifica si un archivo existe. Si se pasa sha1, valida también el hash.
 * @returns {Promise<boolean>}
 */
export const fileExists = (path, sha1 = null) =>
  tauriCmd('file_exists', { path, expectedSha1: sha1 });

/**
 * Descarga un archivo con progreso.
 * Los eventos se escuchan con tauriListen('download://progress', handler).
 */
export const downloadFile = (url, dest, sha1, label) =>
  tauriCmd('download_file', { url, dest, sha1: sha1 ?? null, label });

/**
 * Lanza el juego Minecraft.
 * Los logs llegan via tauriListen('game://log', handler).
 */
export const launchGame = (config) =>
  tauriCmd('launch_game', { config });

/** Detecta instalaciones de Java en el sistema (incluyendo runtimes locales) */
export const detectJava = (launcherDir = null) =>
  tauriCmd('detect_java', { launcherDir });

/**
 * Descarga e instala un Java Runtime desde Adoptium.
 * Emite eventos "java://progress" { phase, percent, label } durante el proceso.
 * @returns {Promise<string>} Ruta al ejecutable java
 */
export const installJavaRuntime = (majorVersion, launcherDir) =>
  tauriCmd('install_java_runtime', { majorVersion, launcherDir });

/**
 * Descarga un mod a instances/{id}/mods/
 * El progreso llega via tauriListen('download://progress', handler)
 */
export const downloadMod = (launcherDir, instanceId, url, filename, sha1 = null) =>
  tauriCmd('download_mod', { launcherDir, instanceId, url, filename, sha1 });

/**
 * Lista todos los mods de una instancia leyendo desde disco.
 * @returns {Promise<Array>} Array de { filename, name, version, enabled }
 */
export const listMods = (launcherDir, instanceId) =>
  tauriCmd('list_mods', { launcherDir, instanceId });

/**
 * Elimina un mod.
 */
export const deleteMod = (launcherDir, instanceId, filename) =>
  tauriCmd('delete_mod', { launcherDir, instanceId, filename });

/**
 * Activa/desactiva un mod.
 */
export const toggleMod = (launcherDir, instanceId, filename, enabled) =>
  tauriCmd('toggle_mod', { launcherDir, instanceId, filename, enabled });

/**
 * Exporta los mods de una instancia como ZIP.
 * @returns {Promise<{path, size_bytes, mod_count}>}
 */
export const exportInstanceMods = (launcherDir, instanceId, destZip) =>
  tauriCmd('export_instance_mods', { launcherDir, instanceId, destZip });

/**
 * Importa mods desde un ZIP.
 * @returns {Promise<{imported, skipped, conflicts}>}
 */
export const importInstanceMods = (launcherDir, instanceId, srcZip, mode) =>
  tauriCmd('import_instance_mods', { launcherDir, instanceId, srcZip, mode });

/**
 * Inspecciona el contenido de un ZIP de mods.
 * @returns {Promise<ManifestInfo>}
 */
export const inspectModsZip = (srcZip) =>
  tauriCmd('inspect_mods_zip', { srcZip });

/**
 * Extrae un ZIP a un directorio destino.
 */
export const extractZip = (zipPath, destDir) =>
  tauriCmd('extract_zip', { zipPath, destDir });

/**
 * Verifica la integridad de una instancia.
 * @returns {Promise<{status, total, missing, corrupt}>}
 */
export const verifyInstance = (launcherDir, instanceId) =>
  tauriCmd('verify_instance', { launcherDir, instanceId });

/**
 * Genera tareas de descarga para reparar una instancia.
 * @returns {Promise<Array<{url, dest, sha1, label}>>}
 */
export const getRepairTasks = (launcherDir, instanceId, fixCorrupt = true) =>
  tauriCmd('get_repair_tasks', { launcherDir, instanceId, fixCorrupt });

// ─────────────────────────────────────────────────────────────────────────────
// Mocks para desarrollo en browser
// ─────────────────────────────────────────────────────────────────────────────
function mockCommand(command, _args) {
  switch (command) {
    case 'get_launcher_dir':
      return Promise.resolve('/mock/minecrack');
    case 'ensure_dir':
      return Promise.resolve();
    case 'write_file':
      return Promise.resolve();
    case 'read_file':
      return Promise.reject(new Error('read_file: no disponible en browser'));
    case 'file_exists':
      return Promise.resolve(false);
    case 'download_file':
      return Promise.resolve();
    case 'launch_game':
      return Promise.resolve();
    case 'detect_java':
      return Promise.resolve([{ path: 'java', version: 'openjdk version "21" (mock)', major_version: 21 }]);
    case 'install_java_runtime':
      return Promise.resolve('/mock/runtimes/java-21/bin/java');
    case 'download_mod':
      return Promise.resolve();
    case 'list_mods':
      return Promise.resolve([
        { filename: 'sodium-0.5.3.jar', name: 'Sodium', version: '0.5.3', enabled: true },
        { filename: 'lithium-0.11.2.jar.disabled', name: 'Lithium', version: '0.11.2', enabled: false },
      ]);
    case 'delete_mod':
      return Promise.resolve();
    case 'toggle_mod':
      return Promise.resolve();
    case 'export_instance_mods':
      return Promise.resolve({ path: '/mock/instance-mods.zip', size_bytes: 5242880, mod_count: 3 });
    case 'import_instance_mods':
      return Promise.resolve({ imported: 3, skipped: 0, conflicts: 0 });
    case 'inspect_mods_zip':
      return Promise.resolve({
        minecrack_version: '0.1.0',
        instance_name: 'Test Instance',
        mc_version: '1.20.1',
        loader: 'fabric',
        loader_version: '0.15.0',
        mods: [
          { filename: 'sodium-0.5.3.jar', sha1: null, enabled: true },
          { filename: 'lithium-0.11.2.jar', sha1: null, enabled: true },
        ],
      });
    case 'verify_instance':
      return Promise.resolve({
        status: 'ok',
        total: 42,
        missing: [],
        corrupt: [],
      });
    case 'get_repair_tasks':
      return Promise.resolve([]);
    case 'extract_zip':
      return Promise.resolve();
    case 'open_dialog':
      return Promise.resolve('/mock/path');
    default:
      return Promise.reject(new Error(`Comando "${command}" no reconocido`));
  }
}
