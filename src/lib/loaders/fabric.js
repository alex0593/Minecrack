// fabric.js — Instalador de Fabric Loader
import { API } from '../../config';
import { ensureDir, writeFile } from '../tauri';
import { getPrismFabricVersions, getPrismFabricVersionData } from '../prism';
import { mavenNameToPath, normalizeLoaderLibraries } from './maven-utils';

/**
 * Obtiene las versiones disponibles de Fabric Loader
 * @param {string} gameVersion - Ej: "1.20.1"
 * @returns {Promise<Array>} [{ version, stable }]
 */
export async function getFabricVersions(gameVersion) {
  try {
    const res = await fetch(`${API.FABRIC.META}/versions/loader/${gameVersion}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from Fabric API`);
    }
    const raw = await res.json();

    // Fabric Meta API returns: [{ loader: { version: "0.19.2", stable: true }, intermediary: {...} }, ...]
    // Extract version from nested loader property
    const versions = raw.map(v => ({
      version: v.version ?? v.loader?.version,
      stable: v.stable !== false,
    })).filter(v => v.version); // Solo versiones válidas

    return versions;
  } catch (err) {
    console.error('[Fabric] Error fetching versions:', err);
    throw new Error(`No se pudieron obtener versiones de Fabric: ${err.message}`);
  }
}

/**
 * Obtiene el perfil completo de lanzamiento de Fabric desde su Meta API.
 * Endpoint: /versions/loader/{gameVersion}/{loaderVersion}/profile/json
 * Incluye todas las librerías necesarias (ASM, Mixin, Fabric, etc.)
 */
async function getFabricInstallerInfo(gameVersion, loaderVersion) {
  try {
    console.log(`[Fabric] Fetching launch profile from Fabric Meta API...`);
    const url = API.FABRIC.launchProfile(gameVersion, loaderVersion);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const profileJson = await res.json();
    console.log(`[Fabric] ✓ Profile obtenido, contiene ${profileJson.libraries?.length ?? 0} librerías`);
    return profileJson;
  } catch (err) {
    console.warn(`[Fabric] No se pudo obtener profile de Fabric Meta API: ${err.message}`);
    return null;
  }
}

/**
 * Genera el JSON de perfil modificado para Fabric
 * @param {object} versionData - Datos de la versión vanilla
 * @param {string} fabricVersion - Versión del loader
 * @param {string} gameVersion - Versión del juego
 * @param {object} installerInfo - Info del instalador de Fabric (incluye todas las libs)
 * @returns {object} JSON del perfil de Fabric
 */

export function generateFabricProfile(versionData, fabricVersion, gameVersion, installerInfo = null) {
  // Normalizar librerías al formato que Rust puede leer (downloads.artifact.path)
  const rawLibs = installerInfo?.libraries || [];
  const libraries = normalizeLoaderLibraries(rawLibs);

  const profile = {
    id: `${gameVersion}-fabric-${fabricVersion}`,
    inheritsFrom: gameVersion,
    releaseTime: versionData.releaseTime,
    time: versionData.time,
    type: versionData.type,
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    arguments: {
      game: versionData.arguments?.game || [],
      jvm: versionData.arguments?.jvm || [],
    },
    libraries,
  };

  return profile;
}

/**
 * Genera tareas de descarga para las librerías de Fabric
 * Extrae todas las librerías del perfil de lanzamiento desde la API
 */
export async function getFabricDownloadTasks(gameVersion, loaderVersion, launcherDir) {
  const tasks = [];
  const librariesDir = `${launcherDir}/libraries`;

  // Helper: Convertir nombre de librería a path
  // Ej: "org.ow2.asm:asm:9.9" → "org/ow2/asm/asm/9.9/asm-9.9.jar"
  const nameToPath = (name) => {
    const parts = name.split(':');
    if (parts.length !== 3) return null;
    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, '/');
    const jarName = `${artifact}-${version}.jar`;
    return `${groupPath}/${artifact}/${version}/${jarName}`;
  };

  // Obtener perfil completo que contiene todas las librerías del API
  const profileJson = await getFabricInstallerInfo(gameVersion, loaderVersion);

  if (profileJson?.libraries && Array.isArray(profileJson.libraries)) {
    console.log(`[Fabric] Generando tareas de descarga para ${profileJson.libraries.length} librerías del API`);

    // Extraer cada librería del perfil del API (maneja dos formatos)
    for (const lib of profileJson.libraries) {
      let url = null;
      let path = null;
      let label = null;

      // Formato antiguo: downloads.artifact.{ path, url }
      const artifact = lib.downloads?.artifact;
      if (artifact?.url && artifact?.path) {
        url = artifact.url;
        path = artifact.path;
        label = artifact.path.split('/').pop();
      }
      // Formato nuevo: url + name (sin downloads.artifact)
      else if (lib.url && lib.name) {
        path = nameToPath(lib.name);
        if (path) {
          url = lib.url + path; // Maven URLs son prefixes: https://maven.fabricmc.net/ + path
          label = path.split('/').pop();
        }
      }

      if (url && path && label) {
        tasks.push({
          url,
          dest: `${librariesDir}/${path}`,
          label,
        });
      }
    }
  } else {
    console.warn('[Fabric] Perfil no tiene librerías, descargando solo fabric-loader');
    // Fallback: al menos descargar el fabric-loader JAR
    const fabricJarPath = `net/fabricmc/fabric-loader/${loaderVersion}/fabric-loader-${loaderVersion}.jar`;
    tasks.push({
      url: `${API.FABRIC.MAVEN}/${fabricJarPath}`,
      dest: `${librariesDir}/${fabricJarPath}`,
      label: `fabric-loader-${loaderVersion}.jar`,
    });
  }

  return tasks;
}

export async function installFabric(gameVersion, loaderVersion, launcherDir, versionData) {
  try {
    console.log(`[Fabric] Iniciando instalación para MC ${gameVersion}, loader version ${loaderVersion || 'latest'}`);

    const versions = await getFabricVersions(gameVersion);
    if (!versions || versions.length === 0) {
      throw new Error(`No hay versiones de Fabric disponibles para MC ${gameVersion}`);
    }

    console.log(`[Fabric] Versiones disponibles para MC ${gameVersion}:`,
      versions.slice(0, 5).map(v => `${v.version}${v.stable ? '' : ' [beta]'}`).join(', '));

    // Usar la versión especificada o la más reciente
    let selectedVersion;
    if (!loaderVersion || loaderVersion === 'latest') {
      selectedVersion = versions[0].version;
      console.log(`[Fabric] Versión 'latest' resuelta a: ${selectedVersion}`);
    } else {
      selectedVersion = loaderVersion;
      console.log(`[Fabric] Buscando versión específica: ${loaderVersion}`);

      // Si la versión no está exactamente en la lista, intentar sin distinción de case
      let exists = versions.find(v => v.version === loaderVersion);
      if (!exists) {
        console.warn(`[Fabric] Versión exacta no encontrada, buscando con tolerancia...`);
        exists = versions.find(v => v.version && v.version.toLowerCase() === loaderVersion.toLowerCase());
      }

      if (!exists) {
        console.error(`[Fabric] Versión ${loaderVersion} no encontrada. Versiones disponibles:`,
          versions.map(v => v.version).join(', '));

        // Fallback: intentar con Prism Meta (que tiene versiones globales sin filtro de MC)
        console.warn(`[Fabric] Intentando fallback a Prism Meta...`);
        try {
          const prismVersions = await getPrismFabricVersions(gameVersion);
          const prismExists = prismVersions.find(v => v.version === loaderVersion);
          if (prismExists) {
            console.log(`[Fabric] ✓ Versión encontrada en Prism Meta: ${loaderVersion}`);
            selectedVersion = loaderVersion;
            exists = prismExists;
          }
        } catch (prismErr) {
          console.warn(`[Fabric] Prism Meta también falló: ${prismErr.message}`);
        }

        if (!exists) {
          throw new Error(`Versión de Fabric ${loaderVersion} no encontrada para MC ${gameVersion}`);
        }
      } else {
        selectedVersion = exists.version; // Usar la versión exacta de la API
      }
    }

    console.log('[Fabric] Versión seleccionada:', selectedVersion);

    // Obtener perfil completo de lanzamiento desde Fabric Meta API
    const installerInfo = await getFabricInstallerInfo(gameVersion, selectedVersion);
    if (installerInfo?.libraries) {
      console.log(`[Fabric] ✓ Profile obtenido con ${installerInfo.libraries.length} librerías`);
    } else {
      console.warn('[Fabric] ✗ No se pudo obtener profile, usando fallback (solo fabric-loader)');
    }

    // Generar el perfil de Fabric con las librerías del API
    const fabricProfile = generateFabricProfile(versionData, selectedVersion, gameVersion, installerInfo);
    console.log(`[Fabric] Perfil final con ${fabricProfile.libraries.length} librerías`);

    // Escribir el perfil a disco
    const profileId = `${gameVersion}-fabric-${selectedVersion}`;
    const versionsDir = `${launcherDir}/versions/${profileId}`;
    await ensureDir(versionsDir);
    await writeFile(`${versionsDir}/${profileId}.json`, JSON.stringify(fabricProfile, null, 2));

    // Generar tareas de descarga
    const downloadTasks = await getFabricDownloadTasks(gameVersion, selectedVersion, launcherDir);

    console.log('[Fabric] Instalación completada');

    return {
      loaderVersion: profileId,
      profile: fabricProfile,
      downloadTasks,
    };
  } catch (err) {
    console.error('[Fabric] Error durante instalación:', err);
    throw err;
  }
}
