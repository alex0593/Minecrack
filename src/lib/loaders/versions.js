/**
 * versions.js — Sistema unificado de consulta de versiones compatibles de loaders
 *
 * Estrategia de fuentes (en orden de preferencia):
 *   1. Prism Launcher Meta API (meta.prismlauncher.org) — datos pre-procesados y estables
 *   2. APIs directas de cada loader (Fabric Meta, Quilt Meta, Forge Maven)
 *   3. Diccionario KNOWN_FORGE_VERSIONS para Forge como último recurso
 */

import { getFabricVersions } from './fabric';
import { getQuiltVersions } from './quilt';
import { getForgeVersions, KNOWN_FORGE_VERSIONS } from './forge';
import { getNeoForgeVersions, KNOWN_NEOFORGE_VERSIONS } from './neoforge';
import {
  getPrismForgeVersions,
  getPrismFabricVersions,
  getPrismQuiltVersions,
  getPrismNeoForgeVersions,
} from '../prism';

// Cache en memoria para evitar refetches
const versionCache = new Map();

/**
 * Obtiene versiones compatibles del loader para una versión de MC.
 * Usa Prism Meta como fuente primaria con fallback a APIs directas.
 *
 * @param {string} loader - 'fabric' | 'quilt' | 'forge'
 * @param {string} gameVersion - Ej: "1.20.1"
 * @returns {Promise<Array>} Array de versiones ordenadas (más reciente primero)
 *         Formato: [{ version: "0.16.0", stable: true, isLatest: true }, ...]
 */
export async function getCompatibleLoaderVersions(loader, gameVersion) {
  if (!gameVersion || loader === 'vanilla') return [];

  const cacheKey = `${loader}:${gameVersion}`;
  if (versionCache.has(cacheKey)) {
    return versionCache.get(cacheKey);
  }

  try {
    let versions = [];

    if (loader === 'fabric') {
      // Fuente primaria: Prism Meta
      versions = await getPrismFabricVersions(gameVersion);

      // Fallback: Fabric Meta directo
      if (versions.length === 0) {
        console.log(`[versions] Fabric: Prism no respondió, usando Fabric Meta directo`);
        const raw = await getFabricVersions(gameVersion);
        versions = raw.map((v, idx) => ({
          version:  v.version ?? v.loader?.version,
          stable:   v.stable !== false,
          isLatest: idx === 0,
        })).filter(v => v.version);
      }

    } else if (loader === 'quilt') {
      // Fuente primaria: Prism Meta
      versions = await getPrismQuiltVersions(gameVersion);

      // Fallback: Quilt Meta directo
      if (versions.length === 0) {
        console.log(`[versions] Quilt: Prism no respondió, usando Quilt Meta directo`);
        const raw = await getQuiltVersions(gameVersion);
        versions = raw.map((v, idx) => ({
          version:  v.version ?? v.loader?.version,
          stable:   v.stable !== false,
          isLatest: idx === 0,
        })).filter(v => v.version);
      }

    } else if (loader === 'forge') {
      // Fuente primaria: Prism Meta (versiones filtradas por MC, formato correcto)
      versions = await getPrismForgeVersions(gameVersion);
      // versions de Prism ya tienen { version: "1.20.1-47.3.12", prismId: "47.3.12", ... }

      // Fallback 1: Forge Maven API directo
      if (versions.length === 0) {
        console.log(`[versions] Forge: Prism no respondió, usando Forge Maven directo`);
        const raw = await getForgeVersions(gameVersion);
        if (raw && raw.length > 0) {
          versions = raw.map((v, idx) => ({
            version:  v,
            stable:   !v.includes('alpha') && !v.includes('beta'),
            isLatest: idx === 0,
          }));
        }
      }

      // Fallback 2: KNOWN_FORGE_VERSIONS (solo match exacto de MC version)
      if (versions.length === 0) {
        const knownVersion = KNOWN_FORGE_VERSIONS[gameVersion];
        if (knownVersion) {
          console.log(`[versions] Forge: usando versión conocida ${knownVersion} para MC ${gameVersion}`);
          versions = [{ version: knownVersion, stable: true, isLatest: true }];
        }
      }

    } else if (loader === 'neoforge') {
      // NeoForge: solo MC 1.20.1+
      const [, minor] = gameVersion.split('.').map(Number);
      if (minor < 20) {
        console.log(`[versions] NeoForge no soporta MC ${gameVersion} (requiere 1.20.1+)`);
        versions = [];
      } else {
        // Fuente primaria: Prism Meta
        versions = await getPrismNeoForgeVersions(gameVersion);

        // Fallback 1: API directa de NeoForge
        if (versions.length === 0) {
          console.log(`[versions] NeoForge: Prism no respondió, usando API directa`);
          const raw = await getNeoForgeVersions(gameVersion);
          if (raw && raw.length > 0) {
            versions = raw.map((v, idx) => ({
              version:  v.version ?? v,
              stable:   !String(v.version ?? v).includes('alpha') && !String(v.version ?? v).includes('beta'),
              isLatest: idx === 0,
            }));
          }
        }

        // Fallback 2: KNOWN_NEOFORGE_VERSIONS
        if (versions.length === 0) {
          const knownVersion = KNOWN_NEOFORGE_VERSIONS[gameVersion];
          if (knownVersion) {
            console.log(`[versions] NeoForge: usando versión conocida ${knownVersion} para MC ${gameVersion}`);
            versions = [{ version: knownVersion, stable: true, isLatest: true }];
          }
        }
      }
    }

    versionCache.set(cacheKey, versions);
    return versions;
  } catch (err) {
    console.error(`[versions] Error obteniendo versiones de ${loader} para MC ${gameVersion}:`, err);
    return [];
  }
}

/**
 * Obtiene la versión más reciente y estable del loader para una MC
 * @param {string} loader
 * @param {string} gameVersion
 * @returns {Promise<string|null>} Versión (ej: "0.16.0"), o null si no hay disponible
 */
export async function getLatestCompatibleVersion(loader, gameVersion) {
  const versions = await getCompatibleLoaderVersions(loader, gameVersion);

  // Preferir versión estable más reciente
  const stable = versions.find(v => v.stable);
  if (stable) return stable.version;

  // Fallback a cualquier versión disponible
  return versions[0]?.version ?? null;
}

/**
 * Determina si un loader está disponible para una MC
 * @returns {Promise<boolean>}
 */
export async function isLoaderAvailable(loader, gameVersion) {
  const versions = await getCompatibleLoaderVersions(loader, gameVersion);
  return versions.length > 0;
}

/**
 * Limpia el cache (útil para testing o forzar refetch)
 */
export function clearVersionCache() {
  versionCache.clear();
}
