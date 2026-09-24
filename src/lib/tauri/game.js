/**
 * tauri/game.js — Wrappers de lanzamiento del juego y de Java
 */

import { tauriCmd } from './core';

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
