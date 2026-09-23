import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { API } from '../config';
import {
  buildAssetDownloadList,
  buildDownloadList,
} from '../lib/mojang';

describe('flujo de instalación de Mojang', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa URLs oficiales aunque no exista .env', () => {
    expect(API.MOJANG.VERSION_MANIFEST).toBe('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    expect(API.MOJANG.ASSETS_BASE).toBe('https://resources.download.minecraft.net');
    expect(API.MOJANG.LIBRARIES_BASE).toBe('https://libraries.minecraft.net');
  });

  it('incluye el artefacto normal y el native classifier de una librería', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true });
    const version = {
      id: '1.21.1',
      downloads: {
        client: { url: 'https://example.test/client.jar', sha1: 'a'.repeat(40), size: 10 },
      },
      libraries: [{
        name: 'org.lwjgl:lwjgl:3.3.3',
        downloads: {
          artifact: {
            path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar',
            url: 'https://example.test/lwjgl.jar',
            sha1: 'b'.repeat(40),
          },
          classifiers: {
            'natives-linux': {
              path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar',
              url: 'https://example.test/lwjgl-native.jar',
              sha1: 'c'.repeat(40),
            },
          },
        },
      }],
      assetIndex: {
        id: '1.21',
        url: 'https://example.test/assets.json',
        sha1: 'd'.repeat(40),
        size: 1,
      },
    };

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('version_manifest_v2.json')) {
        return { ok: true, json: async () => ({ versions: [{ id: '1.21.1', url: 'https://example.test/version.json' }] }) };
      }
      if (url.endsWith('version.json')) {
        return { ok: true, json: async () => version };
      }
      throw new Error(`URL inesperada: ${url}`);
    }));

    const { tasks } = await buildDownloadList('1.21.1', '/launcher');
    const paths = tasks.map(task => task.dest);

    expect(paths).toContain('/launcher/libraries/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar');
    expect(paths).toContain('/launcher/libraries/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar');
  });

  it('rechaza un asset index con formato inválido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ objects: null }),
    })));

    await expect(buildAssetDownloadList({
      id: 'broken',
      url: 'https://example.test/assets.json',
    }, '/launcher')).rejects.toThrow('formato inválido');
  });
});
