// neoforge.js — Instalador de NeoForge Loader
import { API } from '../../config';
import { ensureDir, writeFile } from '../tauri';
import { getPrismNeoForgeVersions, getPrismNeoForgeVersionData } from '../prism';

/**
 * Versiones de NeoForge conocidas con disponibilidad confirmada.
 * NeoForge comenzó en MC 1.20.1 como fork de Forge.
 *
 * Formato de versiones:
 * - MC 1.20.1: "1.20.1-47.1.x" (prefijo heredado de Forge)
 * - MC 1.20.2+: "20.2.x", "20.4.x", "21.1.x" etc. (sin prefijo MC)
 */
export const KNOWN_NEOFORGE_VERSIONS = {
  '1.21.4': '21.4.0',
  '1.21.3': '21.3.0',
  '1.21.1': '21.1.172',
  '1.21':   '21.0.167',
  '1.20.6': '20.6.134',
  '1.20.4': '20.4.237',
  '1.20.3': '20.3.8',
  '1.20.2': '20.2.88',
  '1.20.1': '47.1.106',  // MC 1.20.1 usa el formato heredado de Forge
};

/**
 * Obtiene las versiones de NeoForge disponibles para una versión de MC.
 * @param {string} gameVersion - Ej: "1.20.4"
 * @returns {Promise<Array|null>}
 */
export async function getNeoForgeVersions(gameVersion) {
  try {
    const versions = await getPrismNeoForgeVersions(gameVersion);
    return versions.length > 0 ? versions : null;
  } catch (err) {
    console.warn(`[NeoForge] No se pudieron obtener versiones: ${err.message}`);
    return null;
  }
}

/**
 * Genera el JSON de perfil NeoForge usando los datos de Prism Meta.
 * Si Prism no tiene el perfil, genera uno básico de fallback.
 *
 * @param {object} versionData     - Datos de la versión vanilla de Mojang
 * @param {string} neoforgeVersion - Versión de NeoForge (ej: "21.1.172")
 * @param {string} gameVersion     - Versión de MC (ej: "1.21.1")
 * @param {object|null} prismData  - Datos de Prism Meta para esta versión
 * @returns {object} JSON del perfil de NeoForge
 */
export function generateNeoForgeProfile(versionData, neoforgeVersion, gameVersion, prismData = null) {
  // ID del perfil: "1.21.1-neoforge-21.1.172"
  const profileId = `${gameVersion}-neoforge-${neoforgeVersion}`;

  // ── Con datos de Prism Meta (camino correcto) ─────────────────────────────
  if (prismData?.libraries?.length > 0) {
    const libraries = prismData.libraries
      .filter(lib => lib.downloads?.artifact?.url && lib.downloads?.artifact?.path);

    const mainClass = prismData.mainClass ?? 'cpw.mods.bootstraplauncher.BootstrapLauncher';

    const profile = {
      id: profileId,
      inheritsFrom: gameVersion,
      releaseTime: prismData.releaseTime ?? versionData.releaseTime,
      time: prismData.time ?? versionData.time,
      type: versionData.type,
      mainClass,
      arguments: prismData.arguments ?? versionData.arguments,
      minecraftArguments: prismData.minecraftArguments ?? null,
      libraries,
    };

    console.log(`[NeoForge] Perfil con Prism: mainClass=${mainClass}, ${libraries.length} libraries`);
    return profile;
  }

  // ── Fallback: perfil básico ───────────────────────────────────────────────
  console.warn(`[NeoForge] Sin datos de Prism — perfil básico para ${neoforgeVersion}`);
  return {
    id: profileId,
    inheritsFrom: gameVersion,
    releaseTime: versionData.releaseTime,
    time: versionData.time,
    type: versionData.type,
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: versionData.arguments,
    libraries: [
      {
        name: `net.neoforged:neoforge:${neoforgeVersion}`,
        downloads: {
          artifact: {
            path: `net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-universal.jar`,
            url: `${API.NEOFORGE.MAVEN_BASE}/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-universal.jar`,
            sha1: null,
            size: 0,
          },
        },
      },
    ],
  };
}

/**
 * Construye las tareas de descarga para las libraries de NeoForge.
 * @param {string} neoforgeVersion - Versión de NeoForge
 * @param {string} launcherDir     - Directorio del launcher
 * @param {object} neoProfile      - Perfil generado de NeoForge
 * @returns {Array} Tareas de descarga
 */
export function getNeoForgeDownloadTasks(neoforgeVersion, launcherDir, neoProfile) {
  const tasks = [];
  const librariesDir = `${launcherDir}/libraries`;

  for (const lib of neoProfile.libraries ?? []) {
    const artifact = lib.downloads?.artifact;
    if (!artifact?.url || !artifact?.path) continue;

    tasks.push({
      url:     artifact.url,
      dest:    `${librariesDir}/${artifact.path}`,
      sha1:    artifact.sha1 ?? null,
      label:   lib.name ?? artifact.path.split('/').pop(),
      libPath: artifact.path,
    });
  }

  return tasks;
}

export async function installNeoForge(gameVersion, loaderVersion, launcherDir, versionData) {
  try {
    console.log(`[NeoForge] Iniciando instalación para MC ${gameVersion}, version ${loaderVersion || 'latest'}`);

    // NeoForge solo soporta MC 1.20.1+
    const [, minor] = gameVersion.split('.').map(Number);
    if (minor < 20 || (minor === 20 && parseInt(gameVersion.split('.')[2] || '0') < 1)) {
      throw new Error(`NeoForge no soporta MC ${gameVersion}. Requiere MC 1.20.1 o superior.`);
    }

    // Resolver versión
    let selectedVersion = (loaderVersion && loaderVersion !== 'latest') ? loaderVersion : null;

    if (!selectedVersion) {
      selectedVersion = KNOWN_NEOFORGE_VERSIONS[gameVersion];
      if (selectedVersion) {
        console.log(`[NeoForge] Usando versión conocida para MC ${gameVersion}: ${selectedVersion}`);
      }
    }

    if (!selectedVersion) {
      console.log(`[NeoForge] Buscando versión en Prism Meta para MC ${gameVersion}...`);
      const prismVersions = await getPrismNeoForgeVersions(gameVersion);
      if (prismVersions?.length > 0) {
        selectedVersion = prismVersions[0].version;
        console.log(`[NeoForge] Versión más reciente de Prism: ${selectedVersion}`);
      }
    }

    if (!selectedVersion) {
      throw new Error(`No se encontró versión de NeoForge para MC ${gameVersion}. Mínimo: MC 1.20.1`);
    }

    console.log(`[NeoForge] Versión seleccionada: ${selectedVersion}`);

    // Obtener datos de Prism Meta
    let prismData = null;
    try {
      prismData = await getPrismNeoForgeVersionData(selectedVersion);
      if (prismData?.libraries?.length > 0) {
        console.log(`[NeoForge] ✓ Prism Meta: ${prismData.libraries.length} libraries para ${selectedVersion}`);
      } else {
        console.warn(`[NeoForge] ✗ Prism Meta no tiene libraries, usando fallback`);
        prismData = null;
      }
    } catch (e) {
      console.warn(`[NeoForge] Prism Meta no disponible: ${e.message}`);
    }

    // Generar perfil
    const neoProfile = generateNeoForgeProfile(versionData, selectedVersion, gameVersion, prismData);
    const profileId = neoProfile.id;
    const versionsDir = `${launcherDir}/versions/${profileId}`;
    await ensureDir(versionsDir);
    await writeFile(`${versionsDir}/${profileId}.json`, JSON.stringify(neoProfile, null, 2));
    console.log(`[NeoForge] Perfil guardado: ${profileId}`);

    // Tareas de descarga
    const downloadTasks = getNeoForgeDownloadTasks(selectedVersion, launcherDir, neoProfile);
    console.log(`[NeoForge] Instalación completada — ${downloadTasks.length} archivos a descargar`);

    return {
      loaderVersion: selectedVersion,
      profile: neoProfile,
      downloadTasks,
    };
  } catch (err) {
    console.error('[NeoForge] Error durante instalación:', err);
    throw err;
  }
}
