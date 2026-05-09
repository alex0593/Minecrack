/**
 * resolver.js — Resolución de dependencias para mods
 *
 * Implementa un DFS sobre el grafo de dependencias, validando compatibilidad
 * en cada nodo y detectando ciclos. Devuelve el plan de instalación completo
 * antes de descargar nada.
 */

import { validateModCompatibility, detectConflicts } from './validator.js';

/**
 * @typedef {Object} ResolutionPlan
 * @property {ResolvedEntry[]} toInstall   - Mods a descargar (en orden topológico)
 * @property {SkippedEntry[]}  toSkip      - Ya instalados, se omiten
 * @property {UnresolvedEntry[]} unresolved - Dependencias que no se pudieron resolver
 * @property {string[]}        conflicts   - Conflictos declarados entre mods
 * @property {string[]}        warnings    - Avisos de compatibilidad
 */

/**
 * @typedef {Object} ResolvedEntry
 * @property {import('./metadata').NormalizedMod} mod
 * @property {boolean} isDep    - false = mod principal, true = dependencia
 * @property {number}  depth    - Nivel en el árbol de dependencias
 */

/**
 * @typedef {Object} SkippedEntry
 * @property {string} projectId
 * @property {string} reason    - "already_installed" | "embedded"
 */

/**
 * @typedef {Object} UnresolvedEntry
 * @property {string} projectId
 * @property {string} reason
 */

const MAX_DEPTH = 8;

/**
 * Resuelve el árbol de dependencias de un mod de forma recursiva.
 *
 * @param {import('./metadata').NormalizedMod} rootMod - Mod principal (ya normalizado)
 * @param {object} instance - { version, loader, javaVersion? }
 * @param {string[]} installedIds - IDs de mods ya instalados en la instancia
 * @param {function} fetchMod - async (projectId: string, { gameVersion, loader }) => NormalizedMod
 * @returns {Promise<ResolutionPlan>}
 */
export async function resolveInstallPlan(rootMod, instance, installedIds, fetchMod) {
  const toInstall   = [];
  const toSkip      = [];
  const unresolved  = [];
  const allWarnings = [];
  const allConflicts = [];

  const visited = new Set(); // projectIds ya procesados

  async function dfs(mod, depth, isDep) {
    const projectId = mod.id;

    if (visited.has(projectId)) return;
    visited.add(projectId);

    // ── Validar compatibilidad ───────────────────────────────────────────
    const validation = validateModCompatibility(mod, instance);
    allWarnings.push(...validation.warnings);

    if (!validation.compatible) {
      unresolved.push({
        projectId,
        reason: validation.errors.join('; '),
      });
      return;
    }

    // ── Detectar conflictos con instalados ───────────────────────────────
    const { conflicts } = detectConflicts(mod, installedIds);
    allConflicts.push(...conflicts);

    // ── ¿Ya está instalado? ──────────────────────────────────────────────
    if (installedIds.includes(projectId)) {
      toSkip.push({ projectId, reason: 'already_installed' });
      return;
    }

    // ── Añadir al plan ───────────────────────────────────────────────────
    toInstall.push({ mod, isDep, depth });

    // ── Resolver dependencias ────────────────────────────────────────────
    if (depth >= MAX_DEPTH) return;

    const requiredDeps = mod.dependencies.filter(d => d.type === 'required');
    const embeddedDeps = mod.dependencies.filter(d => d.type === 'embedded');

    // Embeddeds se marcan como skip (vienen dentro del JAR)
    for (const dep of embeddedDeps) {
      toSkip.push({ projectId: dep.projectId, reason: 'embedded' });
    }

    // Resolver requeridas en paralelo (hasta 4 simultáneas para no saturar la API)
    const chunks = chunkArray(requiredDeps, 4);
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async dep => {
        if (visited.has(dep.projectId)) return;

        try {
          const depMod = await fetchMod(dep.projectId, dep.versionId, {
            gameVersion: instance.version,
            loader:      instance.loader,
          });
          await dfs(depMod, depth + 1, true);
        } catch (err) {
          unresolved.push({
            projectId: dep.projectId,
            reason: `No se pudo obtener: ${err.message}`,
          });
        }
      }));
    }
  }

  await dfs(rootMod, 0, false);

  return {
    toInstall,
    toSkip,
    unresolved,
    conflicts: allConflicts,
    warnings:  allWarnings,
  };
}

/**
 * Construye la función fetchMod para Modrinth
 * @param {function} getProjectVersionsFn   - getProjectVersions de modrinth.js
 * @param {function} getVersionFn           - getVersion de modrinth.js
 * @param {function} getProjectFn           - getProject de modrinth.js
 * @param {function} normalizeVersionFn     - normalizeModrinthVersion de metadata.js
 */
export function makeModrinthFetcher(getProjectVersionsFn, getVersionFn, getProjectFn, normalizeVersionFn) {
  return async (projectId, versionId, { gameVersion, loader }) => {
    let version;

    if (versionId) {
      version = await getVersionFn(versionId);
    } else {
      const versions = await getProjectVersionsFn(projectId, { gameVersion, loader });
      version = versions?.[0];
      if (!version) {
        throw new Error(`No hay versiones de "${projectId}" para MC ${gameVersion} + ${loader}`);
      }
    }

    let project = null;
    try {
      project = await getProjectFn(projectId);
    } catch {
      // El proyecto puede no estar disponible; continuar sin metadatos extra
    }

    return normalizeVersionFn(version, project);
  };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
