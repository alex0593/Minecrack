import { getLauncherDir, syncInstance, tauriListen } from './tauri';

export function validateRemoteModpack(remote) {
  if (!remote) return null;
  const apiBaseUrl = remote.apiBaseUrl?.trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(apiBaseUrl); } catch { throw new Error('La URL del ecosistema no es válida'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('El ecosistema debe usar HTTPS; HTTP solo se permite en localhost');
  }
  const modpackId = Number(remote.modpackId);
  if (!Number.isInteger(modpackId) || modpackId <= 0) throw new Error('El ID del modpack no es válido');
  const tracking = remote.tracking === 'pinned' ? 'pinned' : 'active';
  const releaseId = tracking === 'pinned' ? Number(remote.releaseId) : null;
  if (tracking === 'pinned' && (!Number.isInteger(releaseId) || releaseId <= 0)) {
    throw new Error('Debes indicar una release válida para el modo fijado');
  }
  return { apiBaseUrl, modpackId, tracking, releaseId };
}

export async function synchronizeInstance(instance, onProgress) {
  const remote = validateRemoteModpack(instance.remoteModpack);
  if (!remote) return null;
  const launcherDir = await getLauncherDir();
  const unlisten = await tauriListen('sync://progress', onProgress || (() => {}));
  try {
    return await syncInstance({
      launcherDir,
      instanceId: instance.id,
      ...remote,
      minecraftVersion: instance.version,
      loader: instance.loader,
    });
  } finally {
    unlisten?.();
  }
}
