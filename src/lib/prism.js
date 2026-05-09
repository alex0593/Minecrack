/**
 * prism.js — Integración con Prism Launcher Meta API
 *
 * Prism Meta es la fuente de datos más confiable para versiones de loaders,
 * requisitos de Java por versión de MC, y bibliotecas reales que necesita cada loader.
 *
 * Endpoint raíz: https://meta.prismlauncher.org/v1/
 *
 * Uso principal en Minecrack:
 *   1. Reemplaza las llamadas directas a APIs de Forge/Fabric/Quilt (que son inestables)
 *   2. Provee requiresJava correcto por versión de MC
 *   3. Devuelve las libraries con URLs y SHA1s ya validados
 */

import { API } from '../config';

const BASE = API.PRISM.BASE;

// ─── Cache en memoria ─────────────────────────────────────────────────────────
const _cache = new Map();

async function fetchPrism(url) {
  if (_cache.has(url)) return _cache.get(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status} desde Prism Meta: ${url}`);
    const data = await res.json();
    _cache.set(url, data);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MINECRAFT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene el índice de versiones de Minecraft desde Prism Meta.
 * @returns {Promise<Array<{version, type, releaseTime, requiresJava}>>}
 */
export async function getPrismMcVersions() {
  const data = await fetchPrism(API.PRISM.mcIndex());
  // Formato Prism: { versions: [{ version, type, releaseTime, ... }] }
  return data.versions ?? data;
}

/**
 * Obtiene la versión de Java requerida para una versión de MC.
 * Usa Prism Meta como fuente primaria (más confiable que el JSON de Mojang).
 *
 * @param {string} mcVersion - Ej: "1.20.1"
 * @returns {Promise<number>} - Major version de Java, ej: 17, 21
 */
export async function getRequiredJavaVersion(mcVersion) {
  try {
    const data = await fetchPrism(API.PRISM.mcVersion(mcVersion));
    // Prism usa "requires" con uid "net.java"
    const javaReq = data.requires?.find(r => r.uid === 'net.java');
    if (javaReq?.suggests) return parseInt(javaReq.suggests, 10);
    if (javaReq?.equals)   return parseInt(javaReq.equals, 10);
  } catch {
    // fallback a tabla conocida si Prism no responde
  }

  // Tabla de fallback basada en versiones conocidas
  return JAVA_REQUIREMENTS_FALLBACK[mcVersion] ?? inferJavaVersion(mcVersion);
}

/** Tabla de fallback: Java requerido por versión MC conocida */
const JAVA_REQUIREMENTS_FALLBACK = {
  '1.21.4': 21, '1.21.3': 21, '1.21.2': 21, '1.21.1': 21, '1.21': 21,
  '1.20.6': 21, '1.20.5': 21,
  '1.20.4': 17, '1.20.3': 17, '1.20.2': 17, '1.20.1': 17, '1.20': 17,
  '1.19.4': 17, '1.19.3': 17, '1.19.2': 17, '1.19.1': 17, '1.19': 17,
  '1.18.2': 17, '1.18.1': 17, '1.18': 17,
  '1.17.1': 16, '1.17': 16,
  '1.16.5': 8,  '1.16.4': 8,  '1.15.2': 8,  '1.14.4': 8,
  '1.12.2': 8,  '1.8.9': 8,   '1.7.10': 8,
};

function inferJavaVersion(mcVersion) {
  const [, minor] = mcVersion.split('.').map(Number);
  if (minor >= 21) return 21;
  if (minor >= 20) return 17; // 1.20.5+ necesita 21 pero lo cubre la tabla
  if (minor >= 17) return 17;
  return 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene el índice completo de Forge desde Prism Meta (con cache).
 * @returns {Promise<Array>} - Lista de entradas del índice
 */
async function getForgeIndex() {
  const data = await fetchPrism(API.PRISM.forgeIndex());
  return data.versions ?? data ?? [];
}

/**
 * Obtiene las versiones de Forge disponibles para una versión de MC desde Prism Meta.
 *
 * IMPORTANTE: Prism usa solo el número de versión Forge como ID (ej: "47.3.12"),
 * no el formato MC-prefijado ("1.20.1-47.3.12"). El MC version está en "requires".
 *
 * @param {string} mcVersion - Ej: "1.20.1"
 * @returns {Promise<Array<{version, prismId, stable, isLatest}>>}
 *          version   = formato completo usado internamente "1.20.1-47.3.12"
 *          prismId   = ID en Prism Meta "47.3.12" (para fetches individuales)
 */
export async function getPrismForgeVersions(mcVersion) {
  try {
    const entries = await getForgeIndex();

    // Prism index: [{ version: "47.3.12", requires: [{ uid: "net.minecraft", equals: "1.20.1" }] }]
    const versions = entries
      .filter(entry => {
        const req = entry.requires?.find(r => r.uid === 'net.minecraft');
        return req?.equals === mcVersion;
      })
      .map((entry, idx) => ({
        prismId:  entry.version,                       // "47.3.12" — ID real en Prism
        version:  `${mcVersion}-${entry.version}`,     // "1.20.1-47.3.12" — ID interno
        stable:   entry.type !== 'snapshot' && !entry.version.includes('alpha') && !entry.version.includes('beta'),
        isLatest: idx === 0,
      }));

    if (versions.length > 0) {
      console.log(`[Prism] Forge: ${versions.length} versiones para MC ${mcVersion} (más reciente: ${versions[0].version})`);
    }
    return versions;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener versiones de Forge: ${err.message}`);
    return [];
  }
}

/**
 * Obtiene los datos completos de una versión de Forge desde Prism Meta.
 * Incluye mainClass real, libraries con URLs y SHA1s verificados.
 *
 * @param {string} forgeVersionId - Puede ser "1.20.1-47.3.12" (interno) o "47.3.12" (Prism ID)
 * @returns {Promise<object|null>}
 */
export async function getPrismForgeVersionData(forgeVersionId) {
  try {
    // Extraer el prismId: si tiene formato "MC-FORGE", tomar solo la parte FORGE
    const prismId = forgeVersionId.includes('-')
      ? forgeVersionId.split('-').slice(1).join('-')  // "1.20.1-47.3.12" → "47.3.12"
      : forgeVersionId;

    const data = await fetchPrism(`${BASE}/net.minecraftforge/${prismId}.json`);
    return data;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener datos de Forge ${forgeVersionId}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FABRIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene las versiones de Fabric Loader compatibles con una versión de MC.
 *
 * @param {string} mcVersion - Ej: "1.20.1"
 * @returns {Promise<Array<{version, stable, isLatest}>>}
 */
export async function getPrismFabricVersions(mcVersion) {
  try {
    const data = await fetchPrism(API.PRISM.fabricIndex());
    // Prism Fabric index tiene versiones del loader, no filtradas por MC
    // Fabric loader es (casi) universal — compatible con cualquier MC que soporte
    const versions = (data.versions ?? [])
      .slice(0, 30) // limitar a las 30 más recientes
      .map((v, idx) => ({
        version:  v.version,
        stable:   v.type !== 'snapshot' && !v.version.includes('beta'),
        isLatest: idx === 0,
      }));

    return versions;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener versiones de Fabric: ${err.message}`);
    return [];
  }
}

/**
 * Obtiene los datos completos de una versión de Fabric Loader desde Prism Meta.
 * Incluye todas las librerías necesarias (ASM, Mixin, etc.) con URLs y SHA1s.
 *
 * @param {string} fabricVersion - Ej: "0.19.2"
 * @returns {Promise<object>} - Perfil completo con libraries, mainClass, arguments
 */
export async function getPrismFabricVersionData(fabricVersion) {
  try {
    const data = await fetchPrism(`${BASE}/net.fabricmc.fabric-loader/${fabricVersion}.json`);
    return data;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener datos de Fabric ${fabricVersion}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUILT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene las versiones de Quilt Loader desde Prism Meta.
 *
 * @param {string} mcVersion - Ej: "1.20.1"
 * @returns {Promise<Array<{version, stable, isLatest}>>}
 */
export async function getPrismQuiltVersions(mcVersion) {
  try {
    const data = await fetchPrism(API.PRISM.quiltIndex());
    const versions = (data.versions ?? [])
      .slice(0, 20)
      .map((v, idx) => ({
        version:  v.version,
        stable:   v.type !== 'snapshot' && !v.version.includes('beta'),
        isLatest: idx === 0,
      }));

    return versions;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener versiones de Quilt: ${err.message}`);
    return [];
  }
}

/**
 * Obtiene los datos completos de una versión de Quilt Loader desde Prism Meta.
 * Incluye todas las librerías necesarias con URLs y SHA1s.
 *
 * @param {string} quiltVersion - Ej: "0.19.2"
 * @returns {Promise<object>} - Perfil completo con libraries, mainClass, arguments
 */
export async function getPrismQuiltVersionData(quiltVersion) {
  try {
    const data = await fetchPrism(`${BASE}/org.quiltmc.quilt-loader/${quiltVersion}.json`);
    return data;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener datos de Quilt ${quiltVersion}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEOFORGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene el índice completo de NeoForge desde Prism Meta (con cache).
 * @returns {Promise<Array>} - Lista de entradas del índice
 */
async function getNeoForgeIndex() {
  const data = await fetchPrism(API.PRISM.neoforgeIndex());
  return data.versions ?? data ?? [];
}

/**
 * Obtiene las versiones de NeoForge disponibles para una versión de MC desde Prism Meta.
 *
 * Nota: Para MC 1.20.1 NeoForge usa formato "1.20.1-47.x.x" (heredado de Forge).
 * Para MC 1.20.2+ usa formato corto "20.2.x" sin prefijo de MC.
 *
 * @param {string} mcVersion - Ej: "1.20.1"
 * @returns {Promise<Array<{version, prismId, stable, isLatest}>>}
 */
export async function getPrismNeoForgeVersions(mcVersion) {
  try {
    const entries = await getNeoForgeIndex();

    // Prism index: [{ version: "47.1.0", requires: [{ uid: "net.minecraft", equals: "1.20.1" }] }]
    const versions = entries
      .filter(entry => {
        const req = entry.requires?.find(r => r.uid === 'net.minecraft');
        return req?.equals === mcVersion;
      })
      .map((entry, idx) => ({
        prismId:  entry.version,
        version:  entry.version,   // NeoForge usa el prismId directamente (sin prefijo MC)
        stable:   entry.type !== 'snapshot' && !entry.version.includes('alpha') && !entry.version.includes('beta'),
        isLatest: idx === 0,
      }));

    if (versions.length > 0) {
      console.log(`[Prism] NeoForge: ${versions.length} versiones para MC ${mcVersion} (más reciente: ${versions[0].version})`);
    }
    return versions;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener versiones de NeoForge: ${err.message}`);
    return [];
  }
}

/**
 * Obtiene los datos completos de una versión de NeoForge desde Prism Meta.
 * Incluye mainClass, libraries con URLs y SHA1s verificados.
 *
 * @param {string} neoforgeVersion - Ej: "21.1.172"
 * @returns {Promise<object|null>}
 */
export async function getPrismNeoForgeVersionData(neoforgeVersion) {
  try {
    const data = await fetchPrism(`${BASE}/net.neoforged/${neoforgeVersion}.json`);
    return data;
  } catch (err) {
    console.warn(`[Prism] No se pudieron obtener datos de NeoForge ${neoforgeVersion}: ${err.message}`);
    return null;
  }
}

/**
 * Limpia la cache de Prism (útil para forzar re-fetch)
 */
export function clearPrismCache() {
  _cache.clear();
}
