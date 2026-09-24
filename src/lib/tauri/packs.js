/**
 * tauri/packs.js — Wrappers de resource packs y shader packs
 */

import { tauriCmd } from './core';

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
