import { describe, it, expect } from 'vitest';
import { generateFabricProfile } from '../lib/loaders/fabric';

/**
 * Testa el comportamiento esperado de las utilidades Maven utilizadas por los loaders.
 * Estos tests bloquean la forma actual en que funcionan estas utilidades,
 * de modo que cuando P1.1 las deduplica en maven-utils.js, podemos verificar
 * que el comportamiento sigue siendo idéntico.
 */

describe('mavenNameToPath — conversión de coordenadas Maven a paths', () => {
  /**
   * Las pruebas abajo se basan en el comportamiento actual de la función
   * mavenNameToPath() que aparece en fabric.js:65-74.
   * Esta función debe extraerse a maven-utils.js en P1.1,
   * y estas pruebas verificarán que se comporta igual después.
   */

  it('convierte 3-part Maven name (group:artifact:version) a path', () => {
    // Esta prueba documenta el comportamiento esperado.
    // Ej: net.fabricmc:fabric-loader:0.15.0
    // → net/fabricmc/fabric-loader/0.15.0/fabric-loader-0.15.0.jar

    // No podemos testear la función directamente porque está dentro de fabric.js,
    // así que usamos generateFabricProfile() que la usa internamente.
    // Para esta prueba, creamos una librería en formato nuevo { name, url }
    // y verificamos que se convierte correctamente.

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'net.fabricmc:fabric-loader:0.15.0',
          url: 'https://maven.example.com/',
          sha1: 'abc123',
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    // La librería normalizada debe tener el path correcto
    expect(profile.libraries).toHaveLength(1);
    const lib = profile.libraries[0];
    expect(lib.downloads?.artifact?.path).toBe(
      'net/fabricmc/fabric-loader/0.15.0/fabric-loader-0.15.0.jar'
    );
    expect(lib.downloads?.artifact?.url).toBe(
      'https://maven.example.com/net/fabricmc/fabric-loader/0.15.0/fabric-loader-0.15.0.jar'
    );
  });

  it('maneja 4-part Maven names con classifier', () => {
    // Ej: org.lwjgl:lwjgl:3.3.0:natives-windows
    // → org/lwjgl/lwjgl/3.3.0/lwjgl-3.3.0-natives-windows.jar

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'org.lwjgl:lwjgl:3.3.0:natives-windows',
          url: 'https://maven.example.com/',
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    expect(profile.libraries).toHaveLength(1);
    const lib = profile.libraries[0];
    expect(lib.downloads?.artifact?.path).toBe(
      'org/lwjgl/lwjgl/3.3.0/lwjgl-3.3.0-natives-windows.jar'
    );
  });

  it('descarta librerías con menos de 3 partes (nombres inválidos)', () => {
    // Un nombre como "foo:bar" (sin versión) es inválido y debe descartarse

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'invalid:name',  // Solo 2 partes → será descartado
          url: 'https://maven.example.com/',
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    // La librería inválida debe haber sido filtrada
    expect(profile.libraries).toHaveLength(0);
  });

  it('mantiene librerías ya en formato estándar (downloads.artifact.path)', () => {
    // Si una librería ya tiene el formato correcto, no debe cambiar

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'org.example:lib:1.0',
          downloads: {
            artifact: {
              path: 'org/example/lib/1.0/lib-1.0.jar',
              url: 'https://example.com/org/example/lib/1.0/lib-1.0.jar',
              sha1: 'abc123',
              size: 12345,
            },
          },
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    expect(profile.libraries).toHaveLength(1);
    const lib = profile.libraries[0];
    expect(lib.downloads?.artifact?.path).toBe(
      'org/example/lib/1.0/lib-1.0.jar'
    );
    expect(lib.downloads?.artifact?.size).toBe(12345);
  });

  it('convierte múltiples librerías y filtra las inválidas', () => {
    // Un mix de formatos: algunos válidos, algunos inválidos

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        { name: 'a.b:c:1.0', url: 'https://ex.com/' },          // Válido
        { name: 'invalid:only', url: 'https://ex.com/' },        // Inválido
        { name: 'x.y:z:2.0:native', url: 'https://ex.com/' },   // Válido con classifier
        { name: 'missing' },                                       // Inválido
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    // Solo las dos librerías válidas deben quedar
    expect(profile.libraries).toHaveLength(2);
    expect(profile.libraries[0].downloads?.artifact?.path).toContain('a/b/c/1.0/');
    expect(profile.libraries[1].downloads?.artifact?.path).toContain('x/y/z/2.0/');
  });

  it('usa URL base correctamente (con y sin trailing slash)', () => {
    // Las URLs de Fabric pueden venir con o sin / final

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    // Con slash
    const withSlash = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      {
        libraries: [
          {
            name: 'a.b:c:1.0',
            url: 'https://maven.example.com/',  // Con /
          },
        ],
      }
    );

    // Sin slash
    const withoutSlash = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      {
        libraries: [
          {
            name: 'a.b:c:1.0',
            url: 'https://maven.example.com',   // Sin /
          },
        ],
      }
    );

    // Las dos URLs resultantes deben ser idénticas (sin duplicar /)
    const urlWith = withSlash.libraries[0].downloads?.artifact?.url;
    const urlWithout = withoutSlash.libraries[0].downloads?.artifact?.url;

    expect(urlWith).toBe(urlWithout);
    expect(urlWith).toContain('https://maven.example.com/a/b/c/1.0/');
  });
});

describe('normalizeFabricLibraries — contrato de normalización', () => {
  it('preserva librerías que ya tienen formato estándar', () => {
    // Cuando una librería viene con downloads.artifact.path, no debe cambiar

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'com.example:lib:1.0',
          downloads: {
            artifact: {
              path: 'com/example/lib/1.0/lib-1.0.jar',
              url: 'https://example.com/lib.jar',
              sha1: 'oldsha1',
              size: 999,
            },
          },
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    const lib = profile.libraries[0];
    expect(lib.downloads?.artifact?.sha1).toBe('oldsha1');
    expect(lib.downloads?.artifact?.size).toBe(999);
  });

  it('convierte formato nuevo { name, url } al formato con downloads.artifact', () => {
    // El nuevo API de Fabric Meta devuelve { name, url }, debe convertirse

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        {
          name: 'com.example:newlib:2.0',
          url: 'https://maven.fabric.io/',
          sha1: 'newsha1',
          size: 5555,
        },
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    const lib = profile.libraries[0];
    expect(lib.downloads?.artifact?.path).toBe(
      'com/example/newlib/2.0/newlib-2.0.jar'
    );
    expect(lib.downloads?.artifact?.url).toContain('com/example/newlib/2.0/newlib-2.0.jar');
    expect(lib.downloads?.artifact?.sha1).toBe('newsha1');
  });

  it('descarta librerías que no se pueden resolver (sin path)', () => {
    // Si una librería no puede convertirse a un path válido, debe descartarse

    const mockVersionData = {
      releaseTime: '2024-01-01T00:00:00Z',
      time: '2024-01-01T00:00:00Z',
      type: 'release',
    };

    const mockInstallerInfo = {
      libraries: [
        { name: 'valid:lib:1.0', url: 'https://ex.com/' },
        { name: 'invalid' },  // Sin url, sin formato válido
        { name: 'also:broken' },  // Solo 2 partes
      ],
    };

    const profile = generateFabricProfile(
      mockVersionData,
      '0.15.0',
      '1.20.1',
      mockInstallerInfo
    );

    // Solo la librería válida debe quedar
    expect(profile.libraries).toHaveLength(1);
    expect(profile.libraries[0].name).toBe('valid:lib:1.0');
  });
});
