import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  getLauncherDir: vi.fn(),
  syncInstance: vi.fn(),
  tauriListen: vi.fn(),
}));

vi.mock('../lib/tauri', () => tauri);

import { synchronizeInstance, validateRemoteModpack } from '../lib/ecosystem-sync';

describe('validateRemoteModpack', () => {
  it('normaliza una release activa HTTPS', () => {
    expect(validateRemoteModpack({
      apiBaseUrl: ' https://packs.example.test/// ', modpackId: '7', tracking: 'active', releaseId: '9',
    })).toEqual({ apiBaseUrl: 'https://packs.example.test', modpackId: 7, tracking: 'active', releaseId: null });
  });

  it('permite HTTP únicamente en localhost', () => {
    expect(validateRemoteModpack({ apiBaseUrl: 'http://localhost:8000', modpackId: 1 })).toMatchObject({
      apiBaseUrl: 'http://localhost:8000', tracking: 'active',
    });
    expect(() => validateRemoteModpack({ apiBaseUrl: 'http://example.test', modpackId: 1 })).toThrow(/HTTPS/);
  });

  it.each([
    [{ apiBaseUrl: 'no-url', modpackId: 1 }, /URL/],
    [{ apiBaseUrl: 'https://example.test', modpackId: 0 }, /modpack/],
    [{ apiBaseUrl: 'https://example.test', modpackId: 1, tracking: 'pinned' }, /release/],
  ])('rechaza configuración inválida', (remote, message) => {
    expect(() => validateRemoteModpack(remote)).toThrow(message);
  });

  it('normaliza una release fijada', () => {
    expect(validateRemoteModpack({
      apiBaseUrl: 'https://example.test', modpackId: '2', tracking: 'pinned', releaseId: '11',
    })).toEqual({ apiBaseUrl: 'https://example.test', modpackId: 2, tracking: 'pinned', releaseId: 11 });
  });
});

describe('synchronizeInstance', () => {
  const instance = {
    id: 'instance-1', version: '1.20.1', loader: 'fabric',
    remoteModpack: { apiBaseUrl: 'https://example.test/', modpackId: 3, tracking: 'active' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tauri.getLauncherDir.mockResolvedValue('/launcher');
  });

  it('escucha progreso, pasa el contrato IPC y siempre deja de escuchar', async () => {
    const unlisten = vi.fn();
    const progress = vi.fn();
    tauri.tauriListen.mockResolvedValue(unlisten);
    tauri.syncInstance.mockResolvedValue({ releaseId: 12 });

    await expect(synchronizeInstance(instance, progress)).resolves.toEqual({ releaseId: 12 });
    expect(tauri.tauriListen).toHaveBeenCalledWith('sync://progress', progress);
    expect(tauri.syncInstance).toHaveBeenCalledWith({
      launcherDir: '/launcher', instanceId: 'instance-1', apiBaseUrl: 'https://example.test',
      modpackId: 3, tracking: 'active', releaseId: null, minecraftVersion: '1.20.1', loader: 'fabric',
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('libera el listener cuando falla el comando', async () => {
    const unlisten = vi.fn();
    tauri.tauriListen.mockResolvedValue(unlisten);
    tauri.syncInstance.mockRejectedValue(new Error('network down'));
    await expect(synchronizeInstance(instance)).rejects.toThrow('network down');
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('no invoca IPC si la instancia no está vinculada', async () => {
    await expect(synchronizeInstance({ ...instance, remoteModpack: null })).resolves.toBeNull();
    expect(tauri.getLauncherDir).not.toHaveBeenCalled();
  });
});
