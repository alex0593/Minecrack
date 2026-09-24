/**
 * tauri/downloads.js — Wrappers de descargas (archivo genérico, mods, packs)
 */

import { tauriCmd } from './core';

/**
 * Descarga un archivo con progreso.
 * Los eventos se escuchan con tauriListen('download://progress', handler).
 */
export const downloadFile = (url, dest, sha1, label) =>
  tauriCmd('download_file', { url, dest, sha1: sha1 ?? null, label });

/**
 * Descarga un mod a instances/{id}/mods/
 * El progreso llega via tauriListen('download://progress', handler)
 */
export const downloadMod = (launcherDir, instanceId, url, filename, sha1 = null) =>
  tauriCmd('download_mod', { launcherDir, instanceId, url, filename, sha1 });

/** Descarga un resource pack directamente a instances/{id}/resourcepacks/ */
export const downloadResourcePack = (launcherDir, instanceId, url, filename, sha1 = null) =>
  tauriCmd('download_resourcepack', { launcherDir, instanceId, url, filename, sha1 });

/** Descarga un shaderpack directamente a instances/{id}/shaderpacks/ */
export const downloadShaderPack = (launcherDir, instanceId, url, filename, sha1 = null) =>
  tauriCmd('download_shaderpack', { launcherDir, instanceId, url, filename, sha1 });
