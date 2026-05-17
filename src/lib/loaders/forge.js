// forge.js — Instalador de Forge Loader
import { API } from '../../config';
import { ensureDir, writeFile } from '../tauri';
import { getPrismForgeVersionData } from '../prism';
import { mavenNameToPath } from './maven-utils';

/**
 * Obtiene las versiones disponibles de Forge para una versión de Minecraft
 * @param {string} gameVersion - Ej: "1.20.1"
 * @returns {Promise<Array|null>} versiones o null si no existen
 */
export async function getForgeVersions(gameVersion) {
  try {
    // Usar la API de Forge Files que lista todas las versiones disponibles
    const url = `https://files.minecraftforge.net/api/maven/versions/net/minecraftforge/forge`;

    console.log(`[Forge] Consultando versiones para MC ${gameVersion} desde ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // Timeout de 5s

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Forge] HTTP ${res.status} consultando API`);
      return null;
    }

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.warn('[Forge] Respuesta no es JSON válido');
      return null;
    }

    if (!Array.isArray(data)) {
      console.warn('[Forge] Formato inesperado, esperaba array, recibí:', typeof data);
      return null;
    }

    // Filtrar y ordenar versiones
    const forgeVersions = data
      .filter(v => typeof v === 'string' && v.startsWith(`${gameVersion}-`))
      .sort((a, b) => {
        // Ordenar por número de build descendente
        const buildA = parseInt(a.split('-')[1]) || 0;
        const buildB = parseInt(b.split('-')[1]) || 0;
        return buildB - buildA;
      });

    if (forgeVersions.length > 0) {
      console.log(`[Forge] ✓ Encontradas ${forgeVersions.length} versiones para MC ${gameVersion}:`, forgeVersions.slice(0, 3));
    } else {
      console.warn(`[Forge] ✗ No encontradas versiones para MC ${gameVersion}`);
    }

    return forgeVersions.length > 0 ? forgeVersions : null;

  } catch (err) {
    console.error('[Forge] Error consultando versiones:', err.message);
    return null;
  }
}

/**
 * Versiones de Forge conocidas con disponibilidad confirmada
 * Se usa como fallback si la API no responde
 */
// Tabla de versiones más recientes/estables conocidas (actualizada periódicamente
// desde meta.prismlauncher.org). Solo se usa como último fallback si Prism y la
// API directa de Forge fallan.
export const KNOWN_FORGE_VERSIONS = {
  '1.21.4': '1.21.4-54.1.16',
  '1.21.3': '1.21.3-53.1.10',
  '1.21.1': '1.21.1-52.1.14',
  '1.21':   '1.21-51.0.33',
  '1.20.6': '1.20.6-50.2.8',
  '1.20.4': '1.20.4-49.2.7',
  '1.20.2': '1.20.2-48.1.0',
  '1.20.1': '1.20.1-47.4.20',
  '1.19.4': '1.19.4-45.4.3',
  '1.19.2': '1.19.2-43.5.2',
  '1.18.2': '1.18.2-40.3.12',
  '1.17.1': '1.17.1-37.1.1',
  '1.16.5': '1.16.5-36.2.42',
  '1.15.2': '1.15.2-31.2.60',
  '1.14.4': '1.14.4-28.2.28',
  '1.12.2': '1.12.2-14.23.5.2864',
  '1.8.9':  '1.8.9-11.15.1.2318',
  '1.7.10': '1.7.10-10.13.4.1614',
};

/**
 * Intenta encontrar una versión de Minecraft compatible con Forge
 * @param {string} gameVersion - Ej: "1.21"
 * @returns {Promise<string|null>} Una versión MC que sí tiene Forge, o null
 */
export async function findCompatibleForgeVersion(gameVersion) {
  console.log(`[Forge] Buscando versión compatible para MC ${gameVersion}...`);

  // Intentar la versión exacta
  let versions = await getForgeVersions(gameVersion);
  if (versions) {
    console.log(`[Forge] ✓ Encontrada versión exacta: ${gameVersion}`);
    return gameVersion;
  }

  // Versiones de referencia conocidas (ordenadas más recientes primero)
  const fallbacks = [
    '1.21.4', '1.21.3', '1.21.1', '1.21',
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1',
    '1.19.4', '1.19.3', '1.19.2', '1.19.1',
    '1.18.2', '1.18.1',
    '1.17.1',
    '1.16.5',
  ];

  // Intentar fallbacks
  for (const fallback of fallbacks) {
    console.log(`[Forge] Intentando ${fallback}...`);
    versions = await getForgeVersions(fallback);
    if (versions) {
      console.log(`[Forge] ✓ Encontrada versión compatible: ${fallback}`);
      return fallback;
    }
  }

  // Fallback final: si la API falló completamente, usar versiones conocidas
  console.warn(`[Forge] API no responde, usando diccionario de versiones conocidas`);
  for (const [mcVer, forgeVer] of Object.entries(KNOWN_FORGE_VERSIONS)) {
    if (mcVer <= gameVersion || gameVersion <= '1.20.1') {
      console.log(`[Forge] ✓ Usando versión conocida: ${mcVer}`);
      return mcVer;
    }
  }

  // Última opción: usar 1.20.1 que sabemos que tiene Forge
  console.warn(`[Forge] Usando fallback por defecto: 1.20.1`);
  return '1.20.1';
}

/**
 * Genera el JSON de perfil Forge usando los datos reales de Prism Meta.
 * Si Prism no tiene el perfil, genera uno básico de fallback.
 *
 * @param {object} versionData     - Datos de la versión vanilla de Mojang
 * @param {string} forgeVersion    - Versión de Forge (ej: "1.20.1-47.3.12")
 * @param {object|null} prismData  - Datos de Prism Meta para esta versión (puede ser null)
 * @returns {object} JSON del perfil de Forge compatible con el launcher
 */

export function generateForgeProfile(versionData, forgeVersion, prismData = null) {
  // ── Con datos de Prism Meta (camino correcto) ────────────────────────────
  if (prismData?.libraries?.length > 0) {
    // Prism Meta sometimes omits "path" in downloads.artifact (e.g. ForgeWrapper).
    // Derive it from the library name using Maven conventions when absent.
    // Reusable normalizer: derives missing Maven path from name field
    const normalizeArtifact = (entry) => {
      const a = entry.downloads?.artifact;
      if (!a?.url) return null;
      if (!a.path && entry.name) {
        const derived = mavenNameToPath(entry.name);
        if (derived) return { ...entry, downloads: { ...entry.downloads, artifact: { ...a, path: derived } } };
      }
      return a.path ? entry : null;
    };

    const libraries = prismData.libraries.map(normalizeArtifact).filter(Boolean);

    // mavenFiles: archivos auxiliares que ForgeWrapper necesita para ejecutar
    // el instalador de Forge en el primer arranque. NO van al classpath, pero
    // deben estar descargados en libraries/. Sin ellos, ForgeWrapper falla.
    let mavenFiles = (prismData.mavenFiles ?? []).map(normalizeArtifact).filter(Boolean);

    // mainClass de Prism: puede ser ForgeWrapper o el mainClass real de Forge
    // ForgeWrapper (io.github.zekerzhayard.forgewrapper.installer.Main) es un wrapper
    // que Prism usa para instalar Forge on-the-fly — lo usamos igual
    const mainClass = prismData.mainClass ?? 'net.minecraftforge.fml.loading.targets.CommonClientHandler';

    // Si el mainClass es ForgeWrapper, asegurar que el installer JAR está en mavenFiles
    // para que se descargue correctamente
    const isForgeWrapper = mainClass?.includes('forgewrapper') || mainClass?.includes('ForgeWrapper');
    if (isForgeWrapper) {
      const installerEntry = {
        name: `net.minecraftforge:forge:${forgeVersion}:installer`,
        downloads: {
          artifact: {
            path: `net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
            url: `${API.FORGE.MAVEN_BASE}/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
            sha1: null,
            size: 0,
          },
        },
      };
      // Evitar duplicados
      const installerExists = mavenFiles.some(mf => mf.downloads?.artifact?.path?.includes('installer'));
      if (!installerExists) {
        mavenFiles = [...mavenFiles, installerEntry];
      }
    }

    // Determinar argumentos del juego
    // Prism Meta para versiones antiguas de Forge (pre-1.13) NO incluye minecraftArguments.
    // En ese caso, heredamos los de la versión vanilla y añadimos el tweaker FML.
    const isLegacyForge = mainClass === 'net.minecraft.launchwrapper.Launch';
    let minecraftArguments = prismData.minecraftArguments ?? null;
    let profileArguments  = prismData.arguments ?? null;

    if (isLegacyForge) {
      // Para LaunchWrapper, los argumentos deben estar en minecraftArguments (formato legacy)
      if (!minecraftArguments) {
        // Prism no retornó minecraftArguments — tomar los de la versión vanilla como base
        minecraftArguments = versionData.minecraftArguments ?? '';
      }
      // Asegurar que el tweaker FML esté presente
      if (!minecraftArguments.includes('tweakClass')) {
        minecraftArguments = (minecraftArguments + ' --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker').trim();
      }
      // Para versiones legacy, forzar a null el campo arguments (evitar conflicto en buildGameArgs)
      profileArguments = null;
    }

    const profile = {
      // formatVersion 2 = perfil incluye mavenFiles. Perfiles sin este campo
      // se consideran legacy y deben regenerarse antes de lanzar.
      formatVersion: 2,
      id: forgeVersion,
      inheritsFrom: versionData.id,
      releaseTime: prismData.releaseTime ?? versionData.releaseTime,
      time: prismData.time ?? versionData.time,
      type: versionData.type,
      mainClass,
      minecraftArguments,
      arguments: profileArguments,
      libraries,
      mavenFiles,
    };

    console.log(`[Forge] Perfil con Prism: mainClass=${mainClass}, ${libraries.length} libraries, ${mavenFiles.length} mavenFiles`);
    return profile;
  }

  // ── Fallback: perfil básico con universal JAR ────────────────────────────
  console.warn(`[Forge] Sin datos de Prism — perfil básico para ${forgeVersion}`);
  const mcVersion = forgeVersion.split('-')[0]; // Ej: "1.12.2-14.23.5.2864" → "1.12.2"
  const isLegacy = mcVersion && parseInt(mcVersion.split('.')[1]) < 13; // Versiones pre-1.13

  return {
    id: forgeVersion,
    inheritsFrom: versionData.id,
    releaseTime: versionData.releaseTime,
    time: versionData.time,
    type: versionData.type,
    mainClass: isLegacy ? 'net.minecraft.launchwrapper.Launch' : 'net.minecraftforge.fml.loading.targets.CommonClientHandler',
    // Para versiones viejas, el minecraftArguments debe incluir el tweaker FML
    minecraftArguments: isLegacy
      ? `${versionData.minecraftArguments || ''} --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker`.trim()
      : versionData.minecraftArguments,
    libraries: [
      {
        name: `net.minecraftforge:forge:${forgeVersion}:universal`,
        downloads: {
          artifact: {
            path: `net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-universal.jar`,
            url: `${API.FORGE.MAVEN_BASE}/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-universal.jar`,
            sha1: null,
            size: 0,
          },
        },
      },
    ],
  };
}

/**
 * Construye las tareas de descarga para las libraries de Forge.
 * Incluye el installer JAR si el perfil usa ForgeWrapper como mainClass.
 * Cada tarea incluye el libPath para que el descargador pueda usar fallbacks a Maven Central.
 */
export function getForgeDownloadTasks(forgeVersion, launcherDir, forgeProfile) {
  const tasks = [];
  const librariesDir = `${launcherDir}/libraries`;

  // Builder común para libraries y mavenFiles (mismo formato Maven)
  const pushDownloadTask = (entry, kind) => {
    const artifact = entry.downloads?.artifact;
    if (!artifact?.url) return;

    // Derive path from name when absent (Prism Meta sometimes omits it)
    const libPath = artifact.path ?? (entry.name ? mavenNameToPath(entry.name) : null);
    if (!libPath) return;

    tasks.push({
      url:     artifact.url,
      dest:    `${librariesDir}/${libPath}`,
      sha1:    artifact.sha1 ?? null,
      label:   `${kind === 'maven' ? '[maven] ' : ''}${entry.name ?? libPath.split('/').pop()}`,
      libPath,
    });
  };

  // Libraries del perfil (provienen de Prism Meta o fallback) — van al classpath
  for (const lib of forgeProfile.libraries ?? []) {
    pushDownloadTask(lib, 'lib');
  }

  // mavenFiles — auxiliares de ForgeWrapper, NO van al classpath, sí a disco
  // El installer JAR ahora está incluido en mavenFiles si el perfil usa ForgeWrapper
  for (const mf of forgeProfile.mavenFiles ?? []) {
    pushDownloadTask(mf, 'maven');
  }

  return tasks;
}

export async function installForge(gameVersion, loaderVersion, launcherDir, versionData) {
  try {
    // Resolver "latest" o vacío a una versión real
    // IMPORTANTE: "latest" es truthy, hay que compararlo explícitamente
    let selectedVersion = (loaderVersion && loaderVersion !== 'latest') ? loaderVersion : null;

    if (!selectedVersion) {
      selectedVersion = KNOWN_FORGE_VERSIONS[gameVersion];
    }
    if (!selectedVersion) {
      const apiVersions = await getForgeVersions(gameVersion);
      if (apiVersions?.length > 0) selectedVersion = apiVersions[0];
    }
    if (!selectedVersion) {
      console.warn(`[Forge] Sin versión para MC ${gameVersion}, fallback a 1.20.1`);
      selectedVersion = KNOWN_FORGE_VERSIONS['1.20.1'];
    }

    console.log(`[Forge] Instalando versión ${selectedVersion} para MC ${gameVersion}`);

    // ── Obtener datos reales de Prism Meta ──────────────────────────────────
    // Prism Meta tiene la lista REAL de libraries con URLs y SHA1s correctos.
    // Sin esto, intentaríamos descargar "forge-universal.jar" que puede no existir.
    let prismData = null;
    try {
      prismData = await getPrismForgeVersionData(selectedVersion);
      if (prismData?.libraries?.length > 0) {
        console.log(`[Forge] ✓ Prism Meta: ${prismData.libraries.length} libraries para ${selectedVersion}`);
      } else {
        console.warn(`[Forge] ✗ Prism Meta no tiene libraries para ${selectedVersion}, usando fallback`);
        prismData = null;
      }
    } catch (e) {
      console.warn(`[Forge] Prism Meta no disponible: ${e.message}`);
    }

    // ── Generar y persistir el perfil ───────────────────────────────────────
    const forgeProfile = generateForgeProfile(versionData, selectedVersion, prismData);
    const versionsDir = `${launcherDir}/versions/${selectedVersion}`;
    await ensureDir(versionsDir);
    await writeFile(`${versionsDir}/${selectedVersion}.json`, JSON.stringify(forgeProfile, null, 2));

    // ── Tareas de descarga ──────────────────────────────────────────────────
    const downloadTasks = getForgeDownloadTasks(selectedVersion, launcherDir, forgeProfile);
    console.log(`[Forge] Instalación completada — ${downloadTasks.length} archivos a descargar`);

    // ✓ DIAGNÓSTICO: Ver exactamente qué se va a descargar
    console.log(`[Forge] ============ TAREAS DE DESCARGA ============`);
    console.log(`[Forge] Total de libraries: ${forgeProfile.libraries?.length ?? 0}`);
    console.log(`[Forge] Total de mavenFiles: ${forgeProfile.mavenFiles?.length ?? 0}`);

    // Buscar el instalador en las tareas
    const installerTask = downloadTasks.find(t => t.label.includes('installer'));
    if (installerTask) {
      console.log(`[Forge] ✓ Instalador SERÁ descargado:`);
      console.log(`[Forge]   URL: ${installerTask.url}`);
      console.log(`[Forge]   Destino: ${installerTask.dest}`);
      console.log(`[Forge]   Etiqueta: ${installerTask.label}`);
    } else {
      console.warn(`[Forge] ✗ CRÍTICO: Instalador NO está en las tareas de descarga`);
      console.warn(`[Forge] Tareas totales: ${downloadTasks.length}`);
      downloadTasks.forEach((t, i) => {
        console.warn(`[Forge]   [${i}] ${t.label}`);
      });
    }
    console.log(`[Forge] ================================================`);

    return {
      loaderVersion: selectedVersion,
      profile: forgeProfile,
      downloadTasks,
    };
  } catch (err) {
    console.error('[Forge] Error durante instalación:', err);
    throw err;
  }
}
