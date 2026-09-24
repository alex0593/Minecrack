/**
 * tauri/instances.js — Wrappers de instancias (verificar, exportar, importar, sincronizar)
 */

import { tauriCmd, tauriStrictCmd } from './core';

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
export const importInstanceFromFolder = (launcherDir, folderPath, newName, icon, ram, jvmArgs) =>
  tauriCmd('import_instance_from_folder', { launcherDir, folderPath, newName, icon, ram, jvmArgs });

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

/** Sincroniza una instancia vinculada con su release oficial. */
export const syncInstance = (args) =>
  tauriStrictCmd('sync_instance', args);

/** Restaura JARs de una cuarentena después de desvincular la instancia. */
export const restoreQuarantine = (launcherDir, instanceId, quarantinePath) =>
  tauriStrictCmd('restore_quarantine', { launcherDir, instanceId, quarantinePath });

// ─────────────────────────────────────────────────────────────────────────────
