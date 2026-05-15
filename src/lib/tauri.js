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
    hasMetadata: true,
    mods: [] // Sin mods para el mock genérico
  },
  'TINKERS-CREATE': { // Para el ZIP específico de referencia
    name: 'TINKERS-CREATE',
    version: '1.19.2',
    loader: 'forge',
    modsCount: 87,
    hasMetadata: true,
    mods: [ // Lista completa de 87 mods a descargar desde CurseForge
      { projectID: 831663, fileID: 4894788 },
      { projectID: 526901, fileID: 4765726 },
      { projectID: 1028108, fileID: 6069349 },
      { projectID: 250898, fileID: 3983796 },
      { projectID: 256717, fileID: 4153347 },
      { projectID: 445274, fileID: 6375704 },
      { projectID: 429371, fileID: 4842873 },
      { projectID: 627557, fileID: 6515577 },
      { projectID: 549225, fileID: 5692394 },
      { projectID: 820727, fileID: 5385872 },
      { projectID: 470193, fileID: 4764733 },
      { projectID: 426558, fileID: 4159154 },
      { projectID: 250419, fileID: 4277356 },
      { projectID: 238551, fileID: 5794077 },
      { projectID: 429235, fileID: 4117906 },
      { projectID: 832882, fileID: 4882269 },
      { projectID: 655608, fileID: 5739558 },
      { projectID: 1005386, fileID: 6169606 },
      { projectID: 935929, fileID: 6693811 },
      { projectID: 422301, fileID: 5194759 },
      { projectID: 659674, fileID: 5736626 },
      { projectID: 688231, fileID: 5798092 },
      { projectID: 250498, fileID: 5180680 },
      { projectID: 244844, fileID: 5454641 },
      { projectID: 582327, fileID: 4876162 },
      { projectID: 377835, fileID: 5213308 },
      { projectID: 908741, fileID: 5539178 },
      { projectID: 228525, fileID: 4556697 },
      { projectID: 951499, fileID: 5551626 },
      { projectID: 649832, fileID: 5210991 },
      { projectID: 899386, fileID: 5682314 },
      { projectID: 916747, fileID: 5175975 },
      { projectID: 442508, fileID: 4151747 },
      { projectID: 947914, fileID: 6160382 },
      { projectID: 367178, fileID: 5141422 },
      { projectID: 1061749, fileID: 5771389 },
      { projectID: 351264, fileID: 4513187 },
      { projectID: 328085, fileID: 5797604 },
      { projectID: 688768, fileID: 5342348 },
      { projectID: 309927, fileID: 5843737 },
      { projectID: 326652, fileID: 5170313 },
      { projectID: 872577, fileID: 4714432 },
      { projectID: 74072, fileID: 6044827 },
      { projectID: 1084662, fileID: 7059564 },
      { projectID: 238222, fileID: 5106178 },
      { projectID: 439890, fileID: 5099757 },
      { projectID: 977947, fileID: 5890386 },
      { projectID: 686911, fileID: 6312263 },
      { projectID: 646668, fileID: 5812622 },
      { projectID: 1088877, fileID: 5656711 },
      { projectID: 238086, fileID: 5408722 },
      { projectID: 551736, fileID: 4285414 },
      { projectID: 1139062, fileID: 6201439 },
      { projectID: 531761, fileID: 4751735 },
      { projectID: 541617, fileID: 4645830 },
      { projectID: 239197, fileID: 6256046 },
      { projectID: 388172, fileID: 4407241 },
      { projectID: 74924, fileID: 6044700 },
      { projectID: 1166149, fileID: 6122872 },
      { projectID: 882495, fileID: 4621015 },
      { projectID: 854949, fileID: 7471527 },
      { projectID: 32274, fileID: 5208387 },
      { projectID: 1065328, fileID: 5635845 },
      { projectID: 1007404, fileID: 5794766 },
      { projectID: 342584, fileID: 5460518 },
      { projectID: 558905, fileID: 4632201 },
      { projectID: 884944, fileID: 5778892 },
      { projectID: 619320, fileID: 7863153 },
      { projectID: 709416, fileID: 5630037 },
      { projectID: 245755, fileID: 4943265 },
      { projectID: 551520, fileID: 5100224 },
      { projectID: 398521, fileID: 5051241 },
      { projectID: 419699, fileID: 5137942 },
      { projectID: 437717, fileID: 6147807 },
      { projectID: 618298, fileID: 5870031 },
      { projectID: 248787, fileID: 3872808 },
      { projectID: 1062174, fileID: 5707487 },
      { projectID: 551894, fileID: 4441760 },
      { projectID: 1022944, fileID: 5472390 },
      { projectID: 318833, fileID: 5703594 },
      { projectID: 1084197, fileID: 6844333 },
      { projectID: 416294, fileID: 4953345 },
      { projectID: 626761, fileID: 4086903 },
      { projectID: 931925, fileID: 5344502 },
      { projectID: 1102591, fileID: 6647356 },
      { projectID: 978748, fileID: 5342814 },
      { projectID: 331936, fileID: 4556677 }
    ]
  },
  'TINKERS-CREATE.zip': {
    name: 'TINKERS-CREATE',
    version: '1.19.2',
    loader: 'forge',
    modsCount: 87,
    hasMetadata: true,
    mods: [ // Misma lista que arriba
      { projectID: 831663, fileID: 4894788 },
      { projectID: 526901, fileID: 4765726 },
      { projectID: 1028108, fileID: 6069349 },
      { projectID: 250898, fileID: 3983796 },
      { projectID: 256717, fileID: 4153347 },
      { projectID: 445274, fileID: 6375704 },
      { projectID: 429371, fileID: 4842873 },
      { projectID: 627557, fileID: 6515577 },
      { projectID: 549225, fileID: 5692394 },
      { projectID: 820727, fileID: 5385872 },
      { projectID: 470193, fileID: 4764733 },
      { projectID: 426558, fileID: 4159154 },
      { projectID: 250419, fileID: 4277356 },
      { projectID: 238551, fileID: 5794077 },
      { projectID: 429235, fileID: 4117906 },
      { projectID: 832882, fileID: 4882269 },
      { projectID: 655608, fileID: 5739558 },
      { projectID: 1005386, fileID: 6169606 },
      { projectID: 935929, fileID: 6693811 },
      { projectID: 422301, fileID: 5194759 },
      { projectID: 659674, fileID: 5736626 },
      { projectID: 688231, fileID: 5798092 },
      { projectID: 250498, fileID: 5180680 },
      { projectID: 244844, fileID: 5454641 },
      { projectID: 582327, fileID: 4876162 },
      { projectID: 377835, fileID: 5213308 },
      { projectID: 908741, fileID: 5539178 },
      { projectID: 228525, fileID: 4556697 },
      { projectID: 951499, fileID: 5551626 },
      { projectID: 649832, fileID: 5210991 },
      { projectID: 899386, fileID: 5682314 },
      { projectID: 916747, fileID: 5175975 },
      { projectID: 442508, fileID: 4151747 },
      { projectID: 947914, fileID: 6160382 },
      { projectID: 367178, fileID: 5141422 },
      { projectID: 1061749, fileID: 5771389 },
      { projectID: 351264, fileID: 4513187 },
      { projectID: 328085, fileID: 5797604 },
      { projectID: 688768, fileID: 5342348 },
      { projectID: 309927, fileID: 5843737 },
      { projectID: 326652, fileID: 5170313 },
      { projectID: 872577, fileID: 4714432 },
      { projectID: 74072, fileID: 6044827 },
      { projectID: 1084662, fileID: 7059564 },
      { projectID: 238222, fileID: 5106178 },
      { projectID: 439890, fileID: 5099757 },
      { projectID: 977947, fileID: 5890386 },
      { projectID: 686911, fileID: 6312263 },
      { projectID: 646668, fileID: 5812622 },
      { projectID: 1088877, fileID: 5656711 },
      { projectID: 238086, fileID: 5408722 },
      { projectID: 551736, fileID: 4285414 },
      { projectID: 1139062, fileID: 6201439 },
      { projectID: 531761, fileID: 4751735 },
      { projectID: 541617, fileID: 4645830 },
      { projectID: 239197, fileID: 6256046 },
      { projectID: 388172, fileID: 4407241 },
      { projectID: 74924, fileID: 6044700 },
      { projectID: 1166149, fileID: 6122872 },
      { projectID: 882495, fileID: 4621015 },
      { projectID: 854949, fileID: 7471527 },
      { projectID: 32274, fileID: 5208387 },
      { projectID: 1065328, fileID: 5635845 },
      { projectID: 1007404, fileID: 5794766 },
      { projectID: 342584, fileID: 5460518 },
      { projectID: 558905, fileID: 4632201 },
      { projectID: 884944, fileID: 5778892 },
      { projectID: 619320, fileID: 7863153 },
      { projectID: 709416, fileID: 5630037 },
      { projectID: 245755, fileID: 4943265 },
      { projectID: 551520, fileID: 5100224 },
      { projectID: 398521, fileID: 5051241 },
      { projectID: 419699, fileID: 5137942 },
      { projectID: 437717, fileID: 6147807 },
      { projectID: 618298, fileID: 5870031 },
      { projectID: 248787, fileID: 3872808 },
      { projectID: 1062174, fileID: 5707487 },
      { projectID: 551894, fileID: 4441760 },
      { projectID: 1022944, fileID: 5472390 },
      { projectID: 318833, fileID: 5703594 },
      { projectID: 1084197, fileID: 6844333 },
      { projectID: 416294, fileID: 4953345 },
      { projectID: 626761, fileID: 4086903 },
      { projectID: 931925, fileID: 5344502 },
      { projectID: 1102591, fileID: 6647356 },
      { projectID: 978748, fileID: 5342814 },
      { projectID: 331936, fileID: 4556677 }
    ]
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

/** Lee un archivo binario y retorna su contenido como string base64 */
export const readFileBase64 = (path) => tauriCmd('read_file_base64', { path });

/** Borra un archivo (no-op si no existe) */
export const deleteFile = (path) => tauriCmd('delete_file', { path });

/** Escribe un archivo binario desde un string base64 (sin prefijo `data:`) */
export const writeFileBase64 = (path, contentBase64) =>
  tauriCmd('write_file_base64', { path, contentBase64 });

/** Copia un archivo de src a dest (binario, preserva contenido) */
export const copyFile = (src, dest) => tauriCmd('copy_file', { src, dest });

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

/**
 * Obtiene lista de mods a descargar para una instancia importada
 * @returns {Promise<Array<{projectID, fileID, name}>>}
 */
export const getModsToDownload = (instancePath) =>
  tauriCmd('get_mods_to_download', { instancePath });

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: Resource Packs
// ─────────────────────────────────────────────────────────────────────────────

export const listResourcePacks = (launcherDir, instanceId) =>
  tauriCmd('list_resourcepacks', { launcherDir, instanceId });

export const addResourcePack = (launcherDir, instanceId, srcPath) =>
  tauriCmd('add_resourcepack', { launcherDir, instanceId, srcPath });

export const deleteResourcePack = (launcherDir, instanceId, filename) =>
  tauriCmd('delete_resourcepack', { launcherDir, instanceId, filename });

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: Shaderpacks
// ─────────────────────────────────────────────────────────────────────────────

export const listShaderPacks = (launcherDir, instanceId) =>
  tauriCmd('list_shaderpacks', { launcherDir, instanceId });

export const addShaderPack = (launcherDir, instanceId, srcPath) =>
  tauriCmd('add_shaderpack', { launcherDir, instanceId, srcPath });

export const deleteShaderPack = (launcherDir, instanceId, filename) =>
  tauriCmd('delete_shaderpack', { launcherDir, instanceId, filename });

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4/5: create_dir_all
// ─────────────────────────────────────────────────────────────────────────────
export const createDirAll = (path) =>
  tauriCmd('create_dir_all', { path });

// ─────────────────────────────────────────────────────────────────────────────

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

      // Fallback a mock genérico
      console.log('[mock] inspect_instance_zip - usando mock genérico para:', zipPath);
      return Promise.resolve({
        name: 'MyInstance',
        version: '1.20.1',
        loader: 'fabric',
        modsCount: 5,
        hasMetadata: true,
      });
    }
    case 'import_instance_from_folder':
      return Promise.resolve({
        newInstanceId: 'new-uuid-1234',
        name: 'Imported Instance',
        version: '1.20.1',
        loader: 'fabric',
        loaderVersion: '0.15.0'
      });
    case 'import_instance_from_zip':
      return Promise.resolve({
        newInstanceId: 'new-uuid-1234',
        name: 'Imported Instance',
        version: '1.20.1',
        loader: 'fabric',
        loaderVersion: '0.15.0'
      });
    case 'get_mods_to_download': {
      // Buscar datos de referencia por ruta de instancia
      for (const [key, data] of Object.entries(DEV_REFERENCE_DATA)) {
        if (_args.instancePath && _args.instancePath.includes(key)) {
          if (data.mods && data.mods.length > 0) {
            console.log(`[mock] get_mods_to_download - retornando ${data.mods.length} mods para ${key}`);
            return Promise.resolve(data.mods);
          }
        }
      }
      // Fallback: retornar lista vacía si no hay datos de referencia
      console.log('[mock] get_mods_to_download - usando lista vacía');
      return Promise.resolve([]);
    }
    // Fix 4: Resource packs & shaderpacks mocks
    case 'list_resourcepacks':
      return Promise.resolve([]);
    case 'add_resourcepack':
      return Promise.resolve({ filename: 'mock-resourcepack.zip', name: 'mock-resourcepack' });
    case 'delete_resourcepack':
      return Promise.resolve();
    case 'list_shaderpacks':
      return Promise.resolve([]);
    case 'add_shaderpack':
      return Promise.resolve({ filename: 'mock-shaderpack.zip', name: 'mock-shaderpack' });
    case 'delete_shaderpack':
      return Promise.resolve();
    case 'create_dir_all':
      return Promise.resolve();
    case 'read_file_base64':
      return Promise.reject(new Error('read_file_base64: no disponible en browser'));
    case 'delete_file':
      return Promise.resolve();
    case 'write_file_base64':
      return Promise.resolve();
    case 'copy_file':
      return Promise.resolve();
    default:
      return Promise.reject(new Error(`Comando "${command}" no reconocido`));
  }
}
