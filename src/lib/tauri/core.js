/**
 * tauri/core.js — Núcleo IPC: detección del runtime y invoke/listen cacheados
 *
 * Expone los primitivos tauriCmd / tauriStrictCmd / tauriListen usados por
 * todos los wrappers, más IS_TAURI (interno: también lo consume ./dialog;
 * no se re-exporta desde el barrel).
 */

import { mockCommand } from './mock';

export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ─── Cached Tauri module imports (P1.2 optimization) ───────────────────────────
// Load invoke and listen once, cache them to avoid per-call async import() calls.
let tauri_invoke_promise = null;
let tauri_listen_promise = null;

function getTauriInvoke() {
  if (!IS_TAURI) return null;
  if (!tauri_invoke_promise) {
    tauri_invoke_promise = import('@tauri-apps/api/core').then(m => m.invoke).catch(err => {
      console.warn('[tauri] Failed to load invoke:', err?.message || err);
      return null;
    });
  }
  return tauri_invoke_promise;
}

function getTauriListen() {
  if (!IS_TAURI) return null;
  if (!tauri_listen_promise) {
    tauri_listen_promise = import('@tauri-apps/api/event').then(m => m.listen).catch(err => {
      console.warn('[tauri] Failed to load listen:', err?.message || err);
      return null;
    });
  }
  return tauri_listen_promise;
}

// ─── invoke ──────────────────────────────────────────────────────────────────
export async function tauriCmd(command, args = {}) {
  if (!IS_TAURI) {
    console.warn(`[mock] tauriCmd("${command}", ${JSON.stringify(args)})`);
    return mockCommand(command, args);
  }
  try {
    const invoke = await getTauriInvoke();
    if (!invoke) {
      console.warn(`[tauri] invoke not available, falling back to mock for command: ${command}`);
      return mockCommand(command, args);
    }
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

/**
 * IPC estricto para operaciones que nunca pueden simular éxito.
 * A diferencia de tauriCmd, propaga errores nativos y falla en modo navegador.
 */
export async function tauriStrictCmd(command, args = {}) {
  if (!IS_TAURI) {
    throw new Error(`${command} solo está disponible en la aplicación de escritorio`);
  }
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('El puente nativo de Tauri no está disponible');
  return invoke(command, args);
}

// ─── listen ──────────────────────────────────────────────────────────────────
export async function tauriListen(event, handler) {
  if (!IS_TAURI) {
    console.warn(`[mock] tauriListen("${event}")`);
    return () => {}; // unlisten noop
  }
  const listen = await getTauriListen();
  if (!listen) {
    console.warn(`[tauri] listen not available for event: ${event}`);
    return () => {}; // noop
  }
  return listen(event, (e) => handler(e.payload));
}
