/**
 * verify.js — Sistema de verificación y reparación de instancias
 *
 * Valida que una instancia tenga todos los archivos necesarios,
 * verifica SHA1s, y genera tareas de descarga para reparar.
 */

import { readFile, fileExists } from './tauri';
import { getVersionData } from './mojang';

/**
 * Obtiene la lista completa de archivos necesarios para una instancia
 * (incluyendo versión vanilla + loader profile si aplica)
 *
 * @param {string} launcherDir
 * @param {object} instance - { version, loader, loaderVersion }
 * @returns {Promise<Array<{path, sha1, label}>>}
 */
export async function getInstanceRequiredFiles(launcherDir, instance) {
  const files = [];

  try {
    // 1. Versión vanilla: obtener todos los archivos del version JSON
    const versionData = await getVersionData(instance.version);

    // Client JAR
    if (versionData.downloads?.client) {
      files.push({
        path: `${launcherDir}/versions/${instance.version}/${instance.version}.jar`,
        url: versionData.downloads.client.url,
        sha1: versionData.downloads.client.sha1,
        label: `client.jar (${instance.version})`,
      });
    }

    // Libraries vanilla
    const librariesDir = `${launcherDir}/libraries`;
    for (const lib of versionData.libraries ?? []) {
      const artifact = lib.downloads?.artifact;
      if (artifact?.path) {
        files.push({
          path: `${librariesDir}/${artifact.path}`,
          url: artifact.url,
          sha1: artifact.sha1,
          label: lib.name,
        });
      }
    }

    // 2. Loader profile si no es vanilla
    if (instance.loader !== 'vanilla' && instance.loaderVersion) {
      const profileId = getLoaderProfileId(instance);
      const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;

      try {
        const profileJson = await readFile(profilePath);
        const loaderProfile = JSON.parse(profileJson);

        // Libraries del loader
        for (const lib of loaderProfile.libraries ?? []) {
          const artifact = lib.downloads?.artifact;
          if (artifact?.path) {
            files.push({
              path: `${librariesDir}/${artifact.path}`,
              url: artifact.url,
              sha1: artifact.sha1,
              label: `[${instance.loader}] ${lib.name}`,
            });
          }
        }
      } catch (e) {
        console.warn(`[verify] No se pudo leer perfil del loader: ${e.message}`);
      }
    }

    return files;
  } catch (err) {
    console.error(`[verify] Error obteniendo archivos requeridos: ${err.message}`);
    return [];
  }
}

/**
 * Verifica el estado de una instancia
 *
 * @returns {Promise<{status, missing, corrupt, total}>>}
 *          status   = "ok" | "incomplete" | "corrupted"
 *          missing  = archivos no descargados
 *          corrupt  = archivos con SHA1 incorrecto
 *          total    = total de archivos requeridos
 */
export async function verifyInstance(launcherDir, instance) {
  const files = await getInstanceRequiredFiles(launcherDir, instance);
  const missing = [];
  const corrupt = [];

  for (const file of files) {
    const exists = await fileExists(file.path, file.sha1);
    if (!exists) {
      if (await fileExists(file.path)) {
        // Existe pero SHA1 no coincide
        corrupt.push({
          label: file.label,
          path: file.path,
        });
      } else {
        // No existe
        missing.push({
          label: file.label,
          path: file.path,
          url: file.url,
          sha1: file.sha1,
        });
      }
    }
  }

  const status = corrupt.length > 0
    ? 'corrupted'
    : missing.length > 0
    ? 'incomplete'
    : 'ok';

  return {
    status,
    missing,
    corrupt,
    total: files.length,
  };
}

/**
 * Genera tareas de descarga para reparar una instancia
 *
 * @param {string} launcherDir
 * @param {object} instance
 * @param {boolean} fixCorrupt - Si true, también re-descarga archivos corruptos
 * @returns {Promise<Array>} tareas de descarga
 */
export async function getRepairTasks(launcherDir, instance, fixCorrupt = true) {
  const verification = await verifyInstance(launcherDir, instance);
  const tasks = [];

  // Re-descargar archivos faltantes
  for (const file of verification.missing) {
    if (file.url) {
      tasks.push({
        url: file.url,
        dest: file.path,
        sha1: file.sha1,
        label: `[repair] ${file.label}`,
      });
    }
  }

  // Re-descargar archivos corruptos si se pide
  if (fixCorrupt) {
    const allFiles = await getInstanceRequiredFiles(launcherDir, instance);
    for (const corrupt of verification.corrupt) {
      const fileInfo = allFiles.find(f => f.path === corrupt.path);
      if (fileInfo?.url) {
        tasks.push({
          url: fileInfo.url,
          dest: corrupt.path,
          sha1: fileInfo.sha1,
          label: `[repair] ${corrupt.label} (corrupido)`,
        });
      }
    }
  }

  return tasks;
}

/**
 * Helper para construir profileId (copiado de launcher.js)
 */
function getLoaderProfileId(instance) {
  const { loader, loaderVersion, version } = instance;
  if (!loaderVersion || loader === 'vanilla') return null;
  if (loader === 'fabric') return `${version}-fabric-${loaderVersion}`;
  if (loader === 'quilt')  return `${version}-quilt-${loaderVersion}`;
  if (loader === 'forge' || loader === 'neoforge') return loaderVersion;
  return null;
}
