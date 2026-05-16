// quilt.js — Instalador de Quilt Loader
import { API } from '../../config';
import { ensureDir, writeFile } from '../tauri';
import { getPrismQuiltVersions, getPrismQuiltVersionData } from '../prism';

/**
 * Obtiene las versiones disponibles de Quilt Loader
 * @param {string} gameVersion - Ej: "1.20.1"
 * @returns {Promise<Array>} [{ version, stable }]
 */
export async function getQuiltVersions(gameVersion) {
  try {
    const res = await fetch(`${API.QUILT.META}/versions/loader/${gameVersion}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from Quilt API`);
    }
    const raw = await res.json();

    // Quilt Meta API returns: [{ loader: { version: "0.x.x", stable: true }, ... }, ...]
    // Extract version from nested loader property
    const versions = raw.map(v => ({
      version: v.version ?? v.loader?.version,
      stable: v.stable !== false,
    })).filter(v => v.version); // Solo versiones válidas

    return versions;
  } catch (err) {
    console.error('[Quilt] Error fetching versions:', err);
    throw new Error(`No se pudieron obtener versiones de Quilt: ${err.message}`);
  }
}

/**
 * Genera el JSON de perfil modificado para Quilt
 * @param {object} versionData - Datos de la versión vanilla
 * @param {string} quiltVersion - Versión del loader
 * @param {string} gameVersion - Versión del juego
 * @param {object} installerInfo - Info del instalador de Quilt (incluye todas las libs)
 * @returns {object} JSON del perfil de Quilt
 */
function mavenNameToPath(name) {
  const parts = name.split(':');
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, '/');
  const jarName = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
  return `${groupPath}/${artifact}/${version}/${jarName}`;
}

function normalizeQuiltLibraries(libs = []) {
  return libs.map(lib => {
    if (lib.downloads?.artifact?.path) return lib;
    if (lib.name && lib.url !== undefined) {
      const path = mavenNameToPath(lib.name);
      if (!path) return lib;
      const baseUrl = lib.url.endsWith('/') ? lib.url : lib.url + '/';
      return {
        name: lib.name,
        downloads: {
          artifact: {
            path,
            url: baseUrl + path,
            sha1: lib.sha1 || '',
            size: lib.size || 0,
          },
        },
      };
    }
    return lib;
  }).filter(lib => lib.downloads?.artifact?.path);
}

export function generateQuiltProfile(versionData, quiltVersion, gameVersion, installerInfo = null) {
  const rawLibs = installerInfo?.libraries || [];
  const libraries = normalizeQuiltLibraries(rawLibs);

  const profile = {
    id: `${gameVersion}-quilt-${quiltVersion}`,
    inheritsFrom: gameVersion,
    releaseTime: versionData.releaseTime,
    time: versionData.time,
    type: versionData.type,
    mainClass: 'org.quiltmc.loader.impl.launch.knot.KnotClient',
    arguments: {
      game: versionData.arguments?.game || [],
      jvm: versionData.arguments?.jvm || [],
    },
    libraries,
  };

  return profile;
}

/**
 * Obtiene el perfil completo de lanzamiento de Quilt desde su Meta API.
 * Endpoint: /versions/loader/{gameVersion}/{loaderVersion}/profile/json
 * Incluye todas las librerías necesarias
 */
async function getQuiltInstallerInfo(gameVersion, loaderVersion) {
  try {
    console.log(`[Quilt] Fetching launch profile from Quilt Meta API...`);
    const url = API.QUILT.launchProfile(gameVersion, loaderVersion);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const profileJson = await res.json();
    console.log(`[Quilt] ✓ Profile obtenido, contiene ${profileJson.libraries?.length ?? 0} librerías`);
    return profileJson;
  } catch (err) {
    console.warn(`[Quilt] No se pudo obtener profile de Quilt Meta API: ${err.message}`);
    return null;
  }
}

/**
 * Genera tareas de descarga para las librerías de Quilt
 * Extrae todas las librerías del perfil de lanzamiento desde la API
 */
export async function getQuiltDownloadTasks(gameVersion, quiltVersion, launcherDir) {
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
  const profileJson = await getQuiltInstallerInfo(gameVersion, quiltVersion);

  if (profileJson?.libraries && Array.isArray(profileJson.libraries)) {
    console.log(`[Quilt] Generando tareas de descarga para ${profileJson.libraries.length} librerías del API`);

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
          url = lib.url + path; // Maven URLs son prefixes: https://maven.quiltmc.org/ + path
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
    console.warn('[Quilt] Perfil no tiene librerías, descargando solo quilt-loader');
    // Fallback: al menos descargar el quilt-loader JAR
    const quiltJarPath = `org/quiltmc/quilt-loader/${quiltVersion}/quilt-loader-${quiltVersion}.jar`;
    tasks.push({
      url: `${API.QUILT.MAVEN}/${quiltJarPath}`,
      dest: `${librariesDir}/${quiltJarPath}`,
      label: `quilt-loader-${quiltVersion}.jar`,
    });
  }

  return tasks;
}

export async function installQuilt(gameVersion, loaderVersion, launcherDir, versionData) {
  try {
    console.log(`[Quilt] Iniciando instalación para MC ${gameVersion}, loader version ${loaderVersion || 'latest'}`);

    const versions = await getQuiltVersions(gameVersion);
    if (!versions || versions.length === 0) {
      throw new Error(`No hay versiones de Quilt disponibles para MC ${gameVersion}`);
    }

    console.log(`[Quilt] Versiones disponibles para MC ${gameVersion}:`,
      versions.slice(0, 5).map(v => `${v.version}${v.stable ? '' : ' [beta]'}`).join(', '));

    let selectedVersion;
    if (!loaderVersion || loaderVersion === 'latest') {
      selectedVersion = versions[0].version;
      console.log(`[Quilt] Versión 'latest' resuelta a: ${selectedVersion}`);
    } else {
      selectedVersion = loaderVersion;
      console.log(`[Quilt] Buscando versión específica: ${loaderVersion}`);

      // Si la versión no está exactamente en la lista, intentar sin distinción de case
      let exists = versions.find(v => v.version === loaderVersion);
      if (!exists) {
        console.warn(`[Quilt] Versión exacta no encontrada, buscando con tolerancia...`);
        exists = versions.find(v => v.version && v.version.toLowerCase() === loaderVersion.toLowerCase());
      }

      if (!exists) {
        console.error(`[Quilt] Versión ${loaderVersion} no encontrada. Versiones disponibles:`,
          versions.map(v => v.version).join(', '));

        // Fallback: intentar con Prism Meta
        console.warn(`[Quilt] Intentando fallback a Prism Meta...`);
        try {
          const prismVersions = await getPrismQuiltVersions(gameVersion);
          const prismExists = prismVersions.find(v => v.version === loaderVersion);
          if (prismExists) {
            console.log(`[Quilt] ✓ Versión encontrada en Prism Meta: ${loaderVersion}`);
            selectedVersion = loaderVersion;
            exists = prismExists;
          }
        } catch (prismErr) {
          console.warn(`[Quilt] Prism Meta también falló: ${prismErr.message}`);
        }

        if (!exists) {
          throw new Error(`Versión de Quilt ${loaderVersion} no encontrada para MC ${gameVersion}`);
        }
      } else {
        selectedVersion = exists.version; // Usar la versión exacta de la API
      }
    }

    console.log('[Quilt] Versión seleccionada:', selectedVersion);

    // Obtener perfil completo de lanzamiento desde Quilt Meta API
    const installerInfo = await getQuiltInstallerInfo(gameVersion, selectedVersion);
    if (installerInfo?.libraries) {
      console.log(`[Quilt] ✓ Profile obtenido con ${installerInfo.libraries.length} librerías`);
    } else {
      console.warn('[Quilt] ✗ No se pudo obtener profile, usando fallback (solo quilt-loader)');
    }

    const quiltProfile = generateQuiltProfile(versionData, selectedVersion, gameVersion, installerInfo);
    console.log(`[Quilt] Perfil final con ${quiltProfile.libraries.length} librerías`);

    // Escribir el perfil a disco
    const profileId = `${gameVersion}-quilt-${selectedVersion}`;
    const versionsDir = `${launcherDir}/versions/${profileId}`;
    await ensureDir(versionsDir);
    await writeFile(`${versionsDir}/${profileId}.json`, JSON.stringify(quiltProfile, null, 2));

    // Generar tareas de descarga
    const downloadTasks = await getQuiltDownloadTasks(gameVersion, selectedVersion, launcherDir);

    console.log('[Quilt] Instalación completada');

    return {
      loaderVersion: profileId,
      profile: quiltProfile,
      downloadTasks,
    };
  } catch (err) {
    console.error('[Quilt] Error durante instalación:', err);
    throw err;
  }
}
