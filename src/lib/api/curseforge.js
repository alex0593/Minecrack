/**
 * curseforge.js — API de CurseForge para mods y modpacks
 *
 * Búsqueda, descarga y gestión de mods desde CurseForge.
 * Patrón similar a modrinth.js para consistencia.
 */

import { API } from '../../config';
import { normalizeCurseForgeFile } from '../mods/metadata';

const LOG_PREFIX = '[CF-API]';

/**
 * Busca mods en CurseForge
 * @param {string} query - Término de búsqueda
 * @param {Object} options - { gameVersion, loader, limit, offset, sortBy }
 * @returns {Promise<{ data: [], pagination: { ... } }>}
 */
export async function searchMods(query, options = {}) {
  const { gameVersion, loader, limit = 20, offset = 0, sortBy = 'downloads' } = options;

  try {
    const params = new URLSearchParams({
      gameId: '432', // Minecraft
      searchFilter: query,
      pageSize: limit,
      index: offset,
      sortField: mapSortFieldToCF(sortBy),
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    if (loader) {
      params.append('modLoaderType', mapLoaderToCF(loader));
    }

    const url = `${API.CURSEFORGE.search()}?${params.toString()}`;
    console.log(`${LOG_PREFIX} searchMods("${query}")`, { gameVersion, loader });

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
    console.error(`${LOG_PREFIX} searchMods error:`, err);
    throw err;
  }
}

/**
 * Obtiene información completa de un mod
 * @param {number} projectId
 * @returns {Promise<{ id, slug, name, summary, description, authors, logo, ... }>}
 */
export async function getMod(projectId) {
  try {
    console.log(`${LOG_PREFIX} getMod(${projectId})`);

    const response = await fetch(API.CURSEFORGE.mod(projectId), {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} getMod error:`, err);
    throw err;
  }
}

/**
 * Obtiene versiones disponibles de un mod
 * @param {number} projectId
 * @param {Object} options - { gameVersion, loader, limit, offset }
 * @returns {Promise<Array>}
 */
export async function getModFiles(projectId, options = {}) {
  const { gameVersion, loader, limit = 20, offset = 0 } = options;

  try {
    console.log(`${LOG_PREFIX} getModFiles(${projectId})`, { gameVersion, loader });

    const params = new URLSearchParams({
      pageSize: limit,
      index: offset,
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    if (loader) {
      params.append('modLoaderType', mapLoaderToCF(loader));
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
    console.error(`${LOG_PREFIX} getModFiles error:`, err);
    throw err;
  }
}

/**
 * Obtiene información de un archivo específico
 * @param {number} projectId
 * @param {number} fileId
 * @returns {Promise<{ id, fileName, fileDate, fileLength, downloadUrl, ... }>}
 */
export async function getFile(projectId, fileId) {
  try {
    console.log(`${LOG_PREFIX} getFile(${projectId}/${fileId})`);

    const response = await fetch(API.CURSEFORGE.file(projectId, fileId), {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const json = await response.json();
    return json.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} getFile error:`, err);
    throw err;
  }
}

/**
 * Obtiene URL de descarga directa
 * @param {number} projectId
 * @param {number} fileId
 * @returns {Promise<string>} - URL de descarga
 */
export async function getDownloadUrl(projectId, fileId) {
  try {
    console.log(`${LOG_PREFIX} getDownloadUrl(${projectId}/${fileId})`);

    const response = await fetch(API.CURSEFORGE.downloadUrl(projectId, fileId), {
      headers: API.CURSEFORGE.headers(),
    });

    if (!response.ok) {
      throw new Error(`CurseForge download URL error: ${response.status}`);
    }

    const json = await response.json();
    return json.data; // Es una string URL directa
  } catch (err) {
    console.error(`${LOG_PREFIX} getDownloadUrl error:`, err);
    throw err;
  }
}

/**
 * Obtiene info normalizada de un mod + versión específica
 * Útil para resolver dependencias
 * @param {number} projectId
 * @param {number} fileId
 * @returns {Promise<NormalizedMod>}
 */
export async function getModForResolution(projectId, fileId) {
  try {
    console.log(`${LOG_PREFIX} getModForResolution(${projectId}/${fileId})`);

    const [mod, file] = await Promise.all([
      getMod(projectId),
      getFile(projectId, fileId),
    ]);

    return normalizeCurseForgeFile(mod, file);
  } catch (err) {
    console.error(`${LOG_PREFIX} getModForResolution error:`, err);
    throw err;
  }
}

/**
 * Busca el mejor archivo para una combinación de versión MC + loader
 * @param {number} projectId
 * @param {string} gameVersion - Ej: "1.20.1"
 * @param {string} loader - "fabric" | "forge" | "quilt" | "neoforge"
 * @returns {Promise<{ mod, file }>}
 */
export async function selectBestModFile(projectId, gameVersion, loader) {
  try {
    console.log(`${LOG_PREFIX} selectBestModFile(${projectId})`, { gameVersion, loader });

    const [mod, files] = await Promise.all([
      getMod(projectId),
      getModFiles(projectId, { gameVersion, loader, limit: 5 }),
    ]);

    if (!files || files.length === 0) {
      throw new Error(
        `No versions found for ${gameVersion} / ${loader}`
      );
    }

    // Preferir release > beta > alpha
    const bestFile = files.sort((a, b) => {
      const stateOrder = { Release: 0, Beta: 1, Alpha: 2 };
      const aState = stateOrder[a.releaseType] ?? 3;
      const bState = stateOrder[b.releaseType] ?? 3;
      return aState - bState;
    })[0];

    return { mod, file: bestFile };
  } catch (err) {
    console.error(`${LOG_PREFIX} selectBestModFile error:`, err);
    throw err;
  }
}

/**
 * Busca resource packs en CurseForge
 * @param {string} query - Término de búsqueda
 * @param {Object} options - { gameVersion, limit, offset, sortBy }
 * @returns {Promise<{ data: [], pagination: { ... } }>}
 */
export async function searchResourcePacks(query, options = {}) {
  const { gameVersion, limit = 20, offset = 0, sortBy = 'downloads' } = options;

  try {
    const params = new URLSearchParams({
      gameId: '432', // Minecraft
      classId: '12', // Resource Packs
      searchFilter: query,
      pageSize: limit,
      index: offset,
      sortField: mapSortFieldToCF(sortBy),
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    const url = `${API.CURSEFORGE.search()}?${params.toString()}`;
    console.log(`${LOG_PREFIX} searchResourcePacks("${query}")`, { gameVersion });

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
    console.error(`${LOG_PREFIX} searchResourcePacks error:`, err);
    throw err;
  }
}

/**
 * Busca shaderpacks en CurseForge
 * @param {string} query - Término de búsqueda
 * @param {Object} options - { gameVersion, limit, offset, sortBy }
 * @returns {Promise<{ data: [], pagination: { ... } }>}
 */
export async function searchShaderpacks(query, options = {}) {
  const { gameVersion, limit = 20, offset = 0, sortBy = 'downloads' } = options;

  try {
    const params = new URLSearchParams({
      gameId: '432', // Minecraft
      classId: '6552', // Shaders
      searchFilter: query,
      pageSize: limit,
      index: offset,
      sortField: mapSortFieldToCF(sortBy),
    });

    if (gameVersion) {
      params.append('gameVersion', gameVersion);
    }

    const url = `${API.CURSEFORGE.search()}?${params.toString()}`;
    console.log(`${LOG_PREFIX} searchShaderpacks("${query}")`, { gameVersion });

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
    console.error(`${LOG_PREFIX} searchShaderpacks error:`, err);
    throw err;
  }
}

/**
 * Busca modpacks en CurseForge
 * @param {string} query - Término de búsqueda
 * @param {Object} options - { gameVersion, limit, offset, sortBy }
 * @returns {Promise<{ data: [], pagination: { ... } }>}
 */
export async function searchModpacks(query, options = {}) {
  const { gameVersion, limit = 20, offset = 0, sortBy = 'downloads' } = options;

  try {
    const params = new URLSearchParams({
      gameId: '432', // Minecraft
      classId: '4471', // Modpacks
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

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Mapea loader de formato Minecrack a CurseForge modLoaderType
 * @param {string} loader - "fabric" | "forge" | "quilt" | "neoforge" | "vanilla"
 * @returns {number} - CurseForge modLoaderType (1=Any, 2=Forge, 3=Cauldron, 4=LiteLoader, 5=Fabric, 6=Quilt, 7=NeoForge)
 */
function mapLoaderToCF(loader) {
  const mapping = {
    forge: 2,
    fabric: 5,
    quilt: 6,
    neoforge: 7,
  };
  return mapping[loader?.toLowerCase()] ?? 1; // 1 = Any
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

/**
 * Verifica si CurseForge está configurado (tiene API key)
 */
export function isCurseForgeConfigured() {
  return API.CURSEFORGE.isConfigured();
}

/**
 * Extrae SHA1 de un archivo CurseForge
 */
export function extractSha1(file) {
  const hash = (file.hashes ?? []).find(h => h.algo === 1); // 1 = SHA1
  return hash?.value ?? null;
}
