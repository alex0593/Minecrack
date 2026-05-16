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
  '1.21.8': '21.8.53',
  '1.21.5': '21.5.97',
  '1.21.4': '21.4.157',
  '1.21.3': '21.3.96',
  '1.21.1': '21.1.229',
  '1.21':   '21.0.167',
  '1.20.6': '20.6.139',
  '1.20.4': '20.4.251',
  '1.20.2': '20.2.93',
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

// Convierte "group:artifact:version[:classifier]" al path Maven relativo
function nameToMavenPath(name) {
  const parts = name.split(':');
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, '/');
  if (classifier) {
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}-${classifier}.jar`;
  }
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
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
    // Prism Meta a veces omite "path" en downloads.artifact. Derivarlo del name si falta.
    const normalizeArtifact = (entry) => {
      const a = entry.downloads?.artifact;
      if (!a?.url) return null;
      if (!a.path && entry.name) {
        const derived = nameToMavenPath(entry.name);
        if (derived) return { ...entry, downloads: { ...entry.downloads, artifact: { ...a, path: derived } } };
      }
      return a.path ? entry : null;
    };

    const libraries = prismData.libraries.map(normalizeArtifact).filter(Boolean);

    const mainClass = prismData.mainClass ?? 'cpw.mods.bootstraplauncher.BootstrapLauncher';

    // mavenFiles: archivos que ForgeWrapper necesita para instalar NeoForge en el primer arranque.
    // NeoForge 1.20.1 (47.x) usa ForgeWrapper igual que Forge — sin estos archivos no arranca.
    let mavenFiles = (prismData.mavenFiles ?? []).map(normalizeArtifact).filter(Boolean);

    // Si el mainClass es ForgeWrapper, asegurar que el installer JAR está en mavenFiles
    const isForgeWrapper = mainClass?.includes('forgewrapper') || mainClass?.includes('ForgeWrapper');
    if (isForgeWrapper) {
      const installerEntry = {
        name: `net.neoforged:neoforge:${neoforgeVersion}:installer`,
        downloads: {
          artifact: {
            path: `net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`,
            url: `${API.NEOFORGE.MAVEN_BASE}/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`,
            sha1: null,
            size: 0,
          },
        },
      };
      const installerExists = mavenFiles.some(mf => mf.downloads?.artifact?.path?.includes('installer'));
      if (!installerExists) {
        mavenFiles = [...mavenFiles, installerEntry];
      }
    }

    const profile = {
      // formatVersion 2 = perfil generado con el flujo nuevo. Perfiles sin este campo
      // se detectan como legacy y se regeneran en cada lanzamiento (bucle de reparación).
      formatVersion: 2,
      id: profileId,
      inheritsFrom: gameVersion,
      releaseTime: prismData.releaseTime ?? versionData.releaseTime,
      time: prismData.time ?? versionData.time,
      type: versionData.type,
      mainClass,
      arguments: prismData.arguments ?? versionData.arguments,
      minecraftArguments: prismData.minecraftArguments ?? null,
      libraries,
      mavenFiles,
    };

    console.log(`[NeoForge] Perfil con Prism: mainClass=${mainClass}, ${libraries.length} libraries, ${mavenFiles.length} mavenFiles`);
    return profile;
  }

  // ── Fallback: perfil básico ───────────────────────────────────────────────
  console.warn(`[NeoForge] Sin datos de Prism — perfil básico para ${neoforgeVersion}`);
  return {
    formatVersion: 2,
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

  const pushTask = (entry, kind) => {
    const artifact = entry.downloads?.artifact;
    if (!artifact?.url || !artifact?.path) return;
    tasks.push({
      url:     artifact.url,
      dest:    `${librariesDir}/${artifact.path}`,
      sha1:    artifact.sha1 ?? null,
      label:   `${kind === 'maven' ? '[maven] ' : ''}${entry.name ?? artifact.path.split('/').pop()}`,
      libPath: artifact.path,
    });
  };

  // Libraries del perfil — van al classpath (incluye ForgeWrapper si aplica)
  for (const lib of neoProfile.libraries ?? []) {
    pushTask(lib, 'lib');
  }

  // mavenFiles — auxiliares de ForgeWrapper (installer JAR, mcp_config, etc.), NO van al classpath
  for (const mf of neoProfile.mavenFiles ?? []) {
    pushTask(mf, 'maven');
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
      loaderVersion: profileId,
      profile: neoProfile,
      downloadTasks,
    };
  } catch (err) {
    console.error('[NeoForge] Error durante instalación:', err);
    throw err;
  }
}
