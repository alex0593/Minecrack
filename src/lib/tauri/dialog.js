/**
 * tauri/dialog.js — Diálogos nativos de selección de archivo y carpeta
 */

import { IS_TAURI } from './core';

// Cached dialog module import
let tauri_dialog_promise = null;

function getTauriDialog() {
  if (!IS_TAURI) return null;
  if (!tauri_dialog_promise) {
    tauri_dialog_promise = import('@tauri-apps/plugin-dialog').then(m => m.open).catch(err => {
      console.warn('[tauri] Failed to load dialog:', err?.message || err);
      return null;
    });
  }
  return tauri_dialog_promise;
}

/**
 * Abre un diálogo nativo para seleccionar un archivo.
 * @returns {Promise<string|null>} Ruta seleccionada o null si canceló
 */
export async function pickFile({ title = 'Seleccionar archivo', filters } = {}) {
  if (!IS_TAURI) return '/mock/path/java';
  try {
    const open = await getTauriDialog();
    if (!open) {
      console.warn('[pickFile] Dialog module not available');
      return '/mock/path/file.zip';
    }
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
    const open = await getTauriDialog();
    if (!open) {
      console.warn('[pickFolder] Dialog module not available');
      return '/mock/path/folder';
    }
    const path = await open({ multiple: false, directory: true, title });
    console.log(`[pickFolder] Selected: ${path}`);
    return path;
  } catch (err) {
    console.warn(`[pickFolder] Error using Tauri dialog, falling back to mock:`, err?.message || err);
    return '/mock/path/folder'; // Fallback to mock for dev mode
  }
}
