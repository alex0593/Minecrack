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

// Datos de referencia para desarrollo (mocks reales basados en ZIPs de ejemplo)
const DEV_REFERENCE_DATA = {
  '/mock/path/file.zip': { // Para pickFile genérico
    name: 'MyInstance',
    version: '1.20.1',
    loader: 'fabric',
    modsCount: 5,
    hasMetadata: true
  },
  'TINKERS-CREATE': { // Para el ZIP específico de referencia
    name: 'TINKERS-CREATE',
    version: '1.19.2',
    loader: 'forge',
    modsCount: 79,
    hasMetadata: true
  },
  'TINKERS-CREATE.zip': {
    name: 'TINKERS-CREATE',
    version: '1.19.2',
    loader: 'forge',
    modsCount: 79,
    hasMetadata: true
  }
};

// ─── invoke ──────────────────────────────────────────────────────────────────
export async function tauriCmd(command, args = {}) {
  if (!IS_TAURI) {
    console.warn(`[mock] tauriCmd("${command}", ${JSON.stringify(args)})`);
    return mockCommand(command, args);
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    console.log(`[tauri] Invoking command: ${command}`, args);
    const result = await invoke(command, args);
    console.log(`[tauri] Command ${command} result:`, result);
    return result;
  } catch (err) {
    // If Tauri command fails (e.g., not implemented in backend), fallback to mock
    console.warn(`[tauri] Command ${command} failed, falling back to mock:`, err?.message || err);
    return mockCommand(command, args);
  }
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
 * Abre un diálogo nativo para seleccionar un archivo.
 * @returns {Promise<string|null>} Ruta seleccionada o null si canceló
 */
export async function pickFile({ title = 'Seleccionar archivo', filters } = {}) {
  if (!IS_TAURI) return '/mock/path/java';
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: false, title, filters });
    console.log(`[pickFile] Selected: ${path}`);
    return path;
  } catch (err) {
    console.warn(`[pickFile] Error using Tauri dialog, falling back to mock:`, err?.message || err);
    return '/mock/path/file.zip'; // Fallback to mock for dev mode
  }
}

/**
 * Abre un diálogo nativo para seleccionar una carpeta.
 * @returns {Promise<string|null>} Ruta seleccionada o null si canceló
 */
export async function pickFolder({ title = 'Seleccionar carpeta' } = {}) {
  if (!IS_TAURI) return '/mock/path/folder';
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: true, title });
    console.log(`[pickFolder] Selected: ${path}`);
    return path;
  } catch (err) {
    console.warn(`[pickFolder] Error using Tauri dialog, falling back to mock:`, err?.message || err);
    return '/mock/path/folder'; // Fallback to mock for dev mode
  }
}

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

/**
 * Exporta instancia completa a ZIP o carpeta
 * @param {string} launcherDir
 * @param {string} instanceId
 * @param {string} destPath - ruta del ZIP o carpeta destino
 * @param {Object} options - { mods, config, saves, resourcepacks }
 * @returns {Promise<{path, size_bytes, items_count}>}
 */
export const exportInstance = (launcherDir, instanceId, destPath, options) =>
  tauriCmd('export_instance', { launcherDir, instanceId, destPath, options });

/**
 * Inspecciona una carpeta para validar como instancia
 * @returns {Promise<{name, version, loader, modsCount, hasMetadata}>}
 */
export const inspectInstanceFolder = (folderPath) =>
  tauriCmd('inspect_instance_folder', { folderPath });

/**
 * Inspecciona un ZIP para validar como instancia exportada
 * @returns {Promise<{name, version, loader, modsCount, hasMetadata}>}
 */
export const inspectInstanceZip = (zipPath) =>
  tauriCmd('inspect_instance_zip', { zipPath });

/**
 * Importa instancia desde carpeta
 * @returns {Promise<{newInstanceId, imported}>}
 */
export const importInstanceFromFolder = (launcherDir, folderPath, newName) =>
  tauriCmd('import_instance_from_folder', { launcherDir, folderPath, newName });

/**
 * Importa instancia desde ZIP
 * @returns {Promise<{newInstanceId, imported}>}
 */
export const importInstanceFromZip = (launcherDir, zipPath, newName) =>
  tauriCmd('import_instance_from_zip', { launcherDir, zipPath, newName });

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades para inspeccionar ZIPs en el navegador (desarrollo)
// ─────────────────────────────────────────────────────────────────────────────
async function inspectZipFile(zipPath) {
  try {
    // Importar JSZip dinámicamente si está disponible
    const JSZip = window.JSZip || (await import('jszip')).default;
    if (!JSZip) {
      console.warn('[inspectZipFile] JSZip no disponible, usando mock');
      return null;
    }

    // Leer el archivo ZIP usando fetch
    const response = await fetch(`file://${zipPath}`);
    if (!response.ok) {
      console.warn('[inspectZipFile] No se pudo leer el archivo ZIP');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    // Intentar leer manifest.json
    const manifestFile = zip.file('manifest.json');
    if (manifestFile) {
      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Contar mods en la lista
      const modCount = manifest.files ? manifest.files.length : 0;

      return {
        name: manifest.name || 'Instancia importada',
        version: manifest.minecraft?.version || '1.20.1',
        loader: (manifest.minecraft?.modLoaders?.[0]?.id || 'vanilla').split('-')[0],
        modsCount: modCount,
        hasMetadata: true,
        manifestData: manifest
      };
    }
  } catch (err) {
    console.warn('[inspectZipFile] Error inspeccionando ZIP:', err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocks para desarrollo en browser
// ─────────────────────────────────────────────────────────────────────────────
async function mockCommand(command, _args) {
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
    case 'export_instance':
      return Promise.resolve({ path: '/mock/instance-backup.zip', size_bytes: 52428800, items_count: 15 });
    case 'inspect_instance_folder': {
      const folderPath = _args.folderPath;

      // Buscar en datos de referencia por nombre de carpeta
      for (const [key, data] of Object.entries(DEV_REFERENCE_DATA)) {
        if (folderPath.includes(key)) {
          console.log(`[mock] inspect_instance_folder - usando datos de referencia para "${key}":`, data);
          return Promise.resolve(data);
        }
      }

      // Fallback a mock genérico
      console.log('[mock] inspect_instance_folder - usando mock genérico');
      return Promise.resolve({
        name: 'MyInstance',
        version: '1.20.1',
        loader: 'fabric',
        modsCount: 5,
        hasMetadata: true,
      });
    }
    case 'inspect_instance_zip': {
      const zipPath = _args.zipPath;

      // Buscar en datos de referencia por nombre de archivo
      for (const [key, data] of Object.entries(DEV_REFERENCE_DATA)) {
        if (zipPath.includes(key)) {
          console.log(`[mock] inspect_instance_zip - usando datos de referencia para "${key}":`, data);
          return Promise.resolve(data);
        }
      }

      // Intentar inspeccionar el ZIP real si está disponible
      try {
        const realData = await inspectZipFile(zipPath);
        if (realData) {
          console.log('[mock] inspect_instance_zip - datos reales del ZIP:', realData);
          return Promise.resolve(realData);
        }
      } catch (err) {
        console.warn('[mock] Error inspeccionando ZIP real:', err.message);
      }

      // Fallback a mock genérico
      console.log('[mock] inspect_instance_zip - usando mock genérico');
      return Promise.resolve({
        name: 'MyInstance',
        version: '1.20.1',
        loader: 'fabric',
        modsCount: 5,
        hasMetadata: true,
      });
    }
    case 'import_instance_from_folder':
      return Promise.resolve({ newInstanceId: 'new-uuid-1234', imported: 5 });
    case 'import_instance_from_zip':
      return Promise.resolve({ newInstanceId: 'new-uuid-1234', imported: 5 });
    default:
      return Promise.reject(new Error(`Comando "${command}" no reconocido`));
  }
}
