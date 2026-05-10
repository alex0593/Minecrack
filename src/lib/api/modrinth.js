/**
 * modrinth.js — API client para Modrinth
 * Documentación: https://docs.modrinth.com/api/
 */

import { normalizeModrinthVersion } from '../mods/metadata.js';
import { makeModrinthFetcher } from '../mods/resolver.js';

const BASE = 'https://api.modrinth.com/v2';
const HEADERS = { 'User-Agent': 'Minecrack/1.0 (github.com/minecrack)' };

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Modrinth API error ${res.status}: ${path}`);
  return res.json();
}

/**
 * Busca mods en Modrinth
 * @param {object} opts
 * @param {string} opts.query        - Término de búsqueda
 * @param {string} opts.gameVersion  - Filtro de versión MC ("1.20.1")
 * @param {string} opts.loader       - Filtro de loader ("fabric"|"forge"|"quilt"|"vanilla")
 * @param {number} opts.limit        - Resultados por página (default 20)
 * @param {number} opts.offset       - Paginación
 * @returns {Promise<{hits: Array, total_hits: number}>}
 */
export async function searchMods({ query = '', gameVersion, loader, limit = 20, offset = 0 } = {}) {
  const facets = [];
  if (gameVersion) facets.push(`["versions:${gameVersion}"]`);
  if (loader && loader !== 'vanilla') facets.push(`["categories:${loader}"]`);
  facets.push('["project_type:mod"]');

  const params = new URLSearchParams({
    query,
    limit,
    offset,
    facets: `[${facets.join(',')}]`,
  });

  return get(`/search?${params}`);
}

/**
 * Obtiene los detalles de un proyecto (mod)
 * @param {string} projectId - ID o slug del proyecto
 */
export async function getProject(projectId) {
  return get(`/project/${projectId}`);
}

/**
 * Obtiene las versiones disponibles de un proyecto filtradas por loader y MC version
 * @param {string} projectId
 * @param {object} opts
 * @param {string} opts.gameVersion
 * @param {string} opts.loader
 */
export async function getProjectVersions(projectId, { gameVersion, loader } = {}) {
  const params = new URLSearchParams();
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));

  const versions = await get(`/project/${projectId}/version?${params}`);
  return versions;
}

/**
 * Obtiene los detalles de una versión específica con su archivo principal
 * @param {string} versionId
 */
export async function getVersion(versionId) {
  return get(`/version/${versionId}`);
}

/**
 * Normaliza una versión de Modrinth al formato unificado NormalizedMod.
 * Pasa opcionalmente el objeto project para tener nombre/icono completos.
 */
export async function getNormalizedVersion(versionId, projectId = null) {
  const version = await getVersion(versionId);
  let project = null;
  if (projectId) {
    try { project = await getProject(projectId); } catch { /* no crítico */ }
  }
  return normalizeModrinthVersion(version, project);
}

/**
 * Construye una función fetchMod lista para usar en resolveInstallPlan()
 * @returns {Function} async (projectId, versionId, { gameVersion, loader }) => NormalizedMod
 */
export function createModrinthFetcher() {
  return makeModrinthFetcher(
    getProjectVersions,
    getVersion,
    getProject,
    normalizeModrinthVersion
  );
}

/**
 * Busca modpacks en Modrinth
 */
export async function searchModpacks({ query = '', gameVersion, loader, limit = 20, offset = 0 } = {}) {
  const facets = [['project_type:modpack']];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);

  const params = new URLSearchParams({
    query,
    limit,
    offset,
    facets: JSON.stringify(facets),
  });

  return get(`/search?${params}`);
}

/**
 * Obtiene versiones de un modpack
 */
export async function getModpackVersions(projectId, { gameVersion, loader } = {}) {
  const params = new URLSearchParams();
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));
  return get(`/project/${projectId}/version?${params}`);
}

/**
 * @deprecated Usar resolveInstallPlan() de mods/resolver.js en su lugar.
 * Se mantiene para no romper código existente.
 */
export async function resolveDependencies(version, gameVersion, loader, seen = new Set()) {
  const results = [];
  for (const dep of version.dependencies ?? []) {
    if (dep.dependency_type !== 'required') continue;
    const depId = dep.version_id ?? dep.project_id;
    if (seen.has(depId)) continue;
    seen.add(depId);

    try {
      let depVersion;
      if (dep.version_id) {
        depVersion = await getVersion(dep.version_id);
      } else {
        const versions = await getProjectVersions(dep.project_id, { gameVersion, loader });
        depVersion = versions[0];
      }
      if (!depVersion) continue;

      const file = depVersion.files?.find(f => f.primary) ?? depVersion.files?.[0];
      if (file) {
        results.push({ version: depVersion, file });
        const nested = await resolveDependencies(depVersion, gameVersion, loader, seen);
        results.push(...nested);
      }
    } catch {
      // ignorar
    }
  }
  return results;
}
