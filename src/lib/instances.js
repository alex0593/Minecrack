// instances.js — Lógica de gestión de instancias (simulada en frontend por ahora)
import { v4 as uuidv4 } from 'uuid';

// Crea una instancia nueva con valores por defecto
export function createInstance({ name, version, loader, loaderVersion, icon }) {
  return {
    id: uuidv4(),
    name,
    version,
    loader,        // 'vanilla' | 'fabric' | 'forge' | 'quilt'
    loaderVersion: loaderVersion ?? null,
    icon: icon ?? getDefaultIcon(loader),
    ram: 2048,     // MB por defecto
    jvmArgs: '',
    installed: false,  // Se pone a true cuando se completa la instalación
    createdAt: new Date().toISOString(),
    lastPlayed: null,
    playtime: 0,   // segundos
    modsCount: 0,
  };
}

function getDefaultIcon(loader) {
  const icons = {
    vanilla: '🟩',
    fabric: '🟦',
    forge: '🟠',
    quilt: '🟣',
  };
  return icons[loader] ?? '🟩';
}

// Genera los argumentos JVM + juego para lanzar en modo offline
export function buildLaunchArgs({ instance, profile, javaPath, gameDirBase, assetsDir, versionJson }) {
  const gameDir = `${gameDirBase}/${instance.id}`;
  const nativesDir = `${gameDir}/natives`;

  const jvmArgs = [
    `-Xmx${instance.ram}M`,
    `-Xms512M`,
    `-XX:+UseG1GC`,
    `-XX:+ParallelRefProcEnabled`,
    `-XX:MaxGCPauseMillis=200`,
    `-Djava.library.path=${nativesDir}`,
  ];
  if (instance.jvmArgs) {
    jvmArgs.push(...instance.jvmArgs.split(' ').filter(Boolean));
  }

  // Args estándar de Minecraft
  const gameArgs = [
    '--username',     profile.username,
    '--version',      instance.version,
    '--gameDir',      gameDir,
    '--assetsDir',    assetsDir,
    '--assetIndex',   versionJson?.assets || 'legacy',
    '--uuid',         profile.uuid,
    '--accessToken',  '0',
    '--userType',     'legacy',
    '--versionType',  'release',
  ];

  // ── Extraer args extras del loader ──────────────────────────────────────────
  // Los loaders añaden args no-estándar que debemos propagar al proceso Java.
  // Forge legacy (pre-1.13): --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker
  // Forge moderno (1.16+): usa arguments.game con strings y/o objetos condicionales
  // Fabric/Quilt: normalmente no añaden args extra de juego

  const standardKeys = new Set([
    '--username', '--version', '--gameDir', '--assetsDir', '--assetIndex',
    '--uuid', '--accessToken', '--userType', '--versionType',
  ]);

  const vars = {
    '${auth_player_name}': profile.username,
    '${version_name}':     instance.version,
    '${game_directory}':   gameDir,
    '${assets_root}':      assetsDir,
    '${assets_index_name}':versionJson?.assets || 'legacy',
    '${auth_uuid}':        profile.uuid,
    '${auth_access_token}':'0',
    '${user_type}':        'legacy',
    '${version_type}':     'release',
    '${user_properties}':  '{}',
    // Fabric/Quilt game args
    '${clientid}':         '',
    '${auth_xuid}':        '',
  };

  const substituteVars = (str) => {
    let s = str;
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(k, v);
    return s;
  };

  // Formato legacy: minecraftArguments (string separado por espacios)
  if (versionJson?.minecraftArguments) {
    const rawArgs = versionJson.minecraftArguments.split(' ');
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (arg.startsWith('--') && !standardKeys.has(arg)) {
        const val = substituteVars(rawArgs[i + 1] ?? '');
        gameArgs.push(arg, val);
        i++;
      }
    }
  }

  // Formato moderno: arguments.game (array de strings u objetos condicionales)
  if (versionJson?.arguments?.game) {
    for (let i = 0; i < versionJson.arguments.game.length; i++) {
      const arg = versionJson.arguments.game[i];
      if (typeof arg !== 'string') continue; // ignorar objetos condicionales (features)
      if (arg.startsWith('--') && !standardKeys.has(arg)) {
        // El siguiente elemento es el valor
        const next = versionJson.arguments.game[i + 1];
        if (typeof next === 'string' && !next.startsWith('--')) {
          gameArgs.push(arg, substituteVars(next));
          i++;
        } else {
          gameArgs.push(substituteVars(arg));
        }
      }
    }
  }

  return { javaPath, jvmArgs, gameArgs, gameDir, mainClass: versionJson?.mainClass || 'net.minecraft.client.main.Main' };
}

// Genera UUID v3 offline (mismo algoritmo que usa Minecraft)
export function generateOfflineUUID(username) {
  // Simplified: en producción usaríamos uuid v3 con namespace de Minecraft
  // UUID namespace de Minecraft: OfflinePlayer:<username>
  const hex = Array.from(username)
    .reduce((acc, c) => acc + c.charCodeAt(0).toString(16).padStart(2, '0'), '');
  const padded = hex.padEnd(32, '0').slice(0, 32);
  return [
    padded.slice(0, 8),
    padded.slice(8, 12),
    '3' + padded.slice(13, 16),   // version 3
    ((parseInt(padded.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + padded.slice(18, 20),
    padded.slice(20, 32),
  ].join('-');
}

// Versiones de Minecraft disponibles (más populares) — en producción viene de Mojang API
export const POPULAR_VERSIONS = [
  '1.21.4', '1.21.3', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.2', '1.20.1',
  '1.19.4', '1.19.2',
  '1.18.2',
  '1.17.1',
  '1.16.5',
  '1.12.2',
  '1.8.9',
  '1.7.10',
];

export const LOADERS = [
  { id: 'vanilla',  label: 'Vanilla',   color: 'badge-green'  },
  { id: 'fabric',   label: 'Fabric',    color: 'badge-blue'   },
  { id: 'forge',    label: 'Forge',     color: 'badge-amber'  },
  { id: 'quilt',    label: 'Quilt',     color: 'badge-purple' },
  { id: 'neoforge', label: 'NeoForge',  color: 'badge-red'    },
];

/**
 * Descarga un archivo con manejo automático de fallback a mirrors alternativos.
 * Si la URL primaria falla, intenta automáticamente con mirrors de Maven Central.
 *
 * @param {string} url - URL primaria de descarga
 * @param {string} dest - Ruta destino
 * @param {string} sha1 - Hash SHA1 esperado
 * @param {string} label - Etiqueta para logging
 * @param {object} tauriCmd - Función tauriCmd para ejecutar comando download_file
 * @param {string} libPath - (Opcional) Ruta relativa del JAR para construir mirrors (ej: "org/scala-lang/scala-compiler/2.11.1/scala-compiler-2.11.1.jar")
 * @returns {Promise<void>}
 */
export async function downloadFileWithFallback(url, dest, sha1, label, tauriCmd, libPath = null) {
  try {
    // Intentar descarga con URL primaria
    await tauriCmd('download_file', { url, dest, sha1: sha1 ?? null, label });
    return;
  } catch (primaryErr) {
    console.warn(`[downloadFileWithFallback] Descarga primaria falló para ${label}: ${primaryErr.message}`);

    // Si no hay libPath, no hay fallbacks disponibles
    if (!libPath) {
      throw primaryErr;
    }

    // Intentar con mirrors de Maven Central
    const mirrors = [
      'https://repo1.maven.org/maven2',
      'https://central.maven.org/maven2',
      'https://mirrors.aliyun.com/maven/repository/central',
      'https://maven.aliyun.com/repository/central',
    ];

    let lastError = primaryErr;
    for (const mirror of mirrors) {
      const fallbackUrl = `${mirror}/${libPath}`;
      try {
        console.log(`[downloadFileWithFallback] Intentando fallback: ${mirror}`);
        await tauriCmd('download_file', {
          url: fallbackUrl,
          dest,
          sha1: sha1 ?? null,
          label: `${label} (fallback)`
        });
        console.log(`[downloadFileWithFallback] ✓ Descargado desde mirror: ${mirror}`);
        return;
      } catch (fallbackErr) {
        lastError = fallbackErr;
        console.warn(`[downloadFileWithFallback] Fallback falló en ${mirror}: ${fallbackErr.message}`);
        continue;
      }
    }

    // Si todos los fallbacks fallan, lanzar el último error
    throw lastError;
  }
}
