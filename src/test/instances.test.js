import { describe, it, expect } from 'vitest';
import {
  createInstance,
  generateOfflineUUID,
  buildLaunchArgs,
} from '../lib/instances';

describe('createInstance', () => {
  it('devuelve campos obligatorios con valores por defecto', () => {
    const inst = createInstance({ name: 'Test', version: '1.20.1', loader: 'fabric' });
    expect(inst.name).toBe('Test');
    expect(inst.version).toBe('1.20.1');
    expect(inst.loader).toBe('fabric');
    expect(inst.ram).toBe(2048);
    expect(inst.jvmArgs).toBe('');
    expect(inst.id).toBeTruthy();
    expect(inst.createdAt).toBeTruthy();
    expect(inst).toMatchObject({
      remoteModpack: null,
      lastSyncedReleaseId: null,
      lastSyncAt: null,
      lastSyncStatus: null,
    });
  });

  it('asigna icono por defecto según loader', () => {
    expect(createInstance({ name: 'V', version: '1.20.1', loader: 'vanilla' }).icon).toBe('🟩');
    expect(createInstance({ name: 'F', version: '1.20.1', loader: 'fabric' }).icon).toBe('🟦');
    expect(createInstance({ name: 'G', version: '1.20.1', loader: 'forge' }).icon).toBe('🟠');
    expect(createInstance({ name: 'Q', version: '1.20.1', loader: 'quilt' }).icon).toBe('🟣');
  });

  it('respeta loaderVersion pasado', () => {
    const inst = createInstance({ name: 'X', version: '1.20.1', loader: 'fabric', loaderVersion: '0.15.0' });
    expect(inst.loaderVersion).toBe('0.15.0');
  });
});

describe('generateOfflineUUID', () => {
  it('produce un string con formato UUID', () => {
    const uuid = generateOfflineUUID('Player');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('produce el mismo UUID para el mismo username', () => {
    expect(generateOfflineUUID('Alice')).toBe(generateOfflineUUID('Alice'));
  });

  it('produce UUIDs distintos para usernames distintos', () => {
    expect(generateOfflineUUID('Alice')).not.toBe(generateOfflineUUID('Bob'));
  });
});

describe('buildLaunchArgs', () => {
  const instance = createInstance({ name: 'T', version: '1.20.1', loader: 'fabric' });
  const profile  = { username: 'TestPlayer', uuid: '00000000-0000-3000-8000-000000000000' };
  const versionJson = {
    mainClass: 'net.minecraft.client.main.Main',
    assets: '1.20',
  };

  it('incluye -Xmx y library.path en jvmArgs', () => {
    const { jvmArgs } = buildLaunchArgs({
      instance, profile,
      javaPath: '/usr/bin/java',
      gameDirBase: '/home/user/.local/minecrack/instances',
      assetsDir: '/home/user/.local/minecrack/assets',
      versionJson,
    });
    expect(jvmArgs.some(a => a.startsWith('-Xmx'))).toBe(true);
    expect(jvmArgs.some(a => a.includes('java.library.path'))).toBe(true);
  });

  it('incluye --username y --uuid en gameArgs', () => {
    const { gameArgs } = buildLaunchArgs({
      instance, profile,
      javaPath: '/usr/bin/java',
      gameDirBase: '/home/user/.local/minecrack/instances',
      assetsDir: '/home/user/.local/minecrack/assets',
      versionJson,
    });
    expect(gameArgs).toContain('--username');
    expect(gameArgs).toContain('TestPlayer');
    expect(gameArgs).toContain('--uuid');
    expect(gameArgs).toContain(profile.uuid);
  });

  it('añade jvmArgs custom al array', () => {
    const customInst = { ...instance, jvmArgs: '-XX:+UseZGC -Dfoo=bar' };
    const { jvmArgs } = buildLaunchArgs({
      instance: customInst, profile,
      javaPath: '/usr/bin/java',
      gameDirBase: '/base',
      assetsDir: '/assets',
      versionJson,
    });
    expect(jvmArgs).toContain('-XX:+UseZGC');
    expect(jvmArgs).toContain('-Dfoo=bar');
  });
});
