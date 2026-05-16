/**
 * curseforge-modpacks.js — API especializada para modpacks de CurseForge
 *
 * Los modpacks en CurseForge son proyectos del tipo "Modpack".
 * Se descargan como ZIPs que contienen archivos de instancia + mods.
 */

import { API } from '../../config';

const LOG_PREFIX = '[CF-Modpack]';

/**
 * Busca modpacks en CurseForge
 * @param {string} query - Término de búsqueda
 * @param {Object} options - { gameVersion, limit, offset, sortBy }
 * @returns {Promise<{ data: [], pagination: ... }>}
 */
export async function searchModpacks(query, options = {}) {
  const { gameVersion, limit = 20, offset = 0, sortBy = 'downloads' } = options;

  try {
    const params = new URLSearchParams({
      gameId: '432', // Minecraft
      classId: '4471', // 4471 = Modpacks (classId correcto de CurseForge)
      searchFilter: query,
      pageSize: limit,
      index: offset,
      sortField: mapSortFieldToCF(sortBy),
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    const url = `${API.CURSEFORGE.search()}?${params.toString()}`;
    console.log(`${LOG_PREFIX} searchModpacks("${query}")`, { gameVersion });

    const response = await fetch(url, {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();

    return {
      data: json.data || [],
      pagination: {
        index: json.pagination?.index || 0,
        pageSize: json.pagination?.pageSize || limit,
        resultCount: json.pagination?.resultCount || 0,
        totalCount: json.pagination?.totalCount || 0,
      },
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} searchModpacks error:`, err);
    throw err;
  }
}

/**
 * Obtiene información detallada de un modpack
 * @param {number} projectId
 * @returns {Promise<{ id, slug, name, description, logo, summary, authors, ... }>}
 */
export async function getModpack(projectId) {
  try {
    console.log(`${LOG_PREFIX} getModpack(${projectId})`);

    const response = await fetch(API.CURSEFORGE.mod(projectId), {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} getModpack error:`, err);
    throw err;
  }
}

/**
 * Obtiene versiones disponibles de un modpack
 * @param {number} projectId
 * @param {Object} options - { gameVersion, limit, offset }
 * @returns {Promise<Array>} - Array de versiones del modpack
 */
export async function getModpackVersions(projectId, options = {}) {
  const { gameVersion, limit = 20, offset = 0 } = options;

  try {
    console.log(`${LOG_PREFIX} getModpackVersions(${projectId})`, { gameVersion });

    const params = new URLSearchParams({
      pageSize: limit,
      index: offset,
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    const url = `${API.CURSEFORGE.files(projectId)}?${params.toString()}`;
    const response = await fetch(url, {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data || [];
  } catch (err) {
    console.error(`${LOG_PREFIX} getModpackVersions error:`, err);
    throw err;
  }
}

/**
 * Obtiene información de una versión específica del modpack
 * @param {number} projectId
 * @param {number} versionId (fileId en CurseForge)
 * @returns {Promise<{ id, fileName, fileDate, fileLength, downloadUrl, gameVersions, ... }>}
 */
export async function getModpackVersion(projectId, versionId) {
  try {
    console.log(`${LOG_PREFIX} getModpackVersion(${projectId}/${versionId})`);

    const response = await fetch(
      API.CURSEFORGE.file(projectId, versionId),
      {
        headers: API.CURSEFORGE.headers(),
      }
    );

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} getModpackVersion error:`, err);
    throw err;
  }
}

/**
 * Obtiene URL de descarga para una versión del modpack
 * @param {number} projectId
 * @param {number} versionId
 * @returns {Promise<string>} - URL de descarga directa
 */
export async function getModpackDownloadUrl(projectId, versionId) {
  try {
    console.log(`${LOG_PREFIX} getModpackDownloadUrl(${projectId}/${versionId})`);

    const response = await fetch(
      API.CURSEFORGE.downloadUrl(projectId, versionId),
      {
        headers: API.CURSEFORGE.headers(),
      }
    );

    if (!response.ok) {
      throw new Error(`CurseForge download URL error: ${response.status}`);
    }

    const json = await response.json();
    return json.data; // Es una string URL directa
  } catch (err) {
    console.error(`${LOG_PREFIX} getModpackDownloadUrl error:`, err);
    throw err;
  }
}

/**
 * Obtiene información de modpack + versión de forma optimizada
 * Útil para el flujo de descarga: get modpack info + best version
 * @param {number} projectId
 * @param {string} gameVersion - Ej: "1.20.1" (opcional)
 * @returns {Promise<{ modpack, versions: [], bestVersion }>}
 */
export async function getModpackWithVersions(projectId, gameVersion = null) {
  try {
    console.log(`${LOG_PREFIX} getModpackWithVersions(${projectId})`, { gameVersion });

    const [modpack, versions] = await Promise.all([
      getModpack(projectId),
      getModpackVersions(projectId, { gameVersion, limit: 10 }),
    ]);

    // Seleccionar mejor versión (más reciente release)
    const bestVersion = versions.find(v => v.releaseType === 'Release') ||
                        versions.find(v => v.releaseType === 'Beta') ||
                        versions[0];

    return {
      modpack,
      versions,
      bestVersion,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} getModpackWithVersions error:`, err);
    throw err;
  }
}

/**
 * Formatea información de modpack para mostrar en UI
 * @param {Object} modpack - Dato de modpack de CurseForge
 * @param {Object} version - Dato de versión específica
 * @returns {Object} - Información formateada
 */
export function formatModpackInfo(modpack, version) {
  return {
    id: modpack.id,
    name: modpack.name,
    slug: modpack.slug,
    description: modpack.summary || modpack.description,
    logo: modpack.logo?.url,
    authors: modpack.authors?.map(a => a.name).join(', '),
    versionId: version.id,
    versionName: version.displayName || version.fileName,
    fileName: version.fileName,
    fileSize: version.fileLength,
    releaseType: version.releaseType, // 'Release', 'Beta', 'Alpha'
    releaseDate: version.fileDate,
    gameVersions: version.gameVersions || [],
    downloadCount: version.downloadCount || 0,
    sortableGameVersions: version.sortableGameVersions || [],
  };
}

/**
 * Verifica si CurseForge está configurado
 */
export function isCurseForgeConfigured() {
  return API.CURSEFORGE.isConfigured();
}

/**
 * Mapea el string de ordenamiento a ModsSearchSortField de CurseForge
 * 1 = Featured, 2 = Popularity, 3 = LastUpdated, 4 = Name, 6 = TotalDownloads
 */
function mapSortFieldToCF(sortBy) {
  const mapping = {
    downloads: 2,
    name: 4,
    dateCreated: 3,
    featured: 1
  };
  return mapping[sortBy] || 2;
}
