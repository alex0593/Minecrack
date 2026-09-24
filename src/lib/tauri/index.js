/**
 * tauri/ — Wrapper seguro para todos los comandos Tauri (IPC)
 *
 * Detecta si estamos dentro de Tauri o en el browser (dev web),
 * y proporciona mocks en el segundo caso para no romper la UI.
 *
 * Estructura:
 *   core.js        — detección del runtime y primitivos tauriCmd/tauriStrictCmd/tauriListen
 *   mock.js        — datos y mockCommand de desarrollo (API interna, NO se re-exporta aquí)
 *   fs/downloads/mods/packs/instances/game/dialog — wrappers tipados agrupados por dominio
 *   index.js       — este barrel: re-exporta exactamente los mismos nombres públicos
 *                    que exportaba el antiguo src/lib/tauri.js
 *
 * Uso:
 *   import { tauriCmd, tauriListen } from './tauri';
 *   const dir = await tauriCmd('get_launcher_dir');
 *   const unlisten = await tauriListen('download://progress', handler);
 */

// ./core exporta además IS_TAURI (lo usa ./dialog); se re-exportan a mano
// sólo los tres primitivos públicos para no ampliar la API del barrel.
export { tauriCmd, tauriStrictCmd, tauriListen } from './core';
export * from './fs';
export * from './downloads';
export * from './mods';
export * from './packs';
export * from './instances';
export * from './game';
export * from './dialog';
