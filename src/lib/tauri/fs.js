/**
 * tauri/fs.js — Wrappers de sistema de archivos (archivos, directorios, ZIP)
 */

import { tauriCmd } from './core';

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
 * Extrae un ZIP a un directorio destino.
 */
export const extractZip = (zipPath, destDir) =>
  tauriCmd('extract_zip', { zipPath, destDir });

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4/5: create_dir_all
// ─────────────────────────────────────────────────────────────────────────────
export const createDirAll = (path) =>
  tauriCmd('create_dir_all', { path });

/** Elimina un directorio y todo su contenido (equivalente a rm -rf) */
export const removeDir = (path) =>
  tauriCmd('remove_dir', { path });

/** Copia un directorio recursivamente; no-op si src no existe */
export const copyDir = (src, dst) =>
  tauriCmd('copy_dir', { src, dst });
