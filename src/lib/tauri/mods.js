/**
 * tauri/mods.js — Wrappers de gestión de mods de una instancia
 */

import { tauriCmd } from './core';

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
