/**
 * validator.js — Validador de compatibilidad de mods
 *
 * Determina si un mod normalizado puede instalarse en una instancia dada.
 * Devuelve un objeto { compatible, warnings, errors } en lugar de un simple booleano
 * para que la UI pueda mostrar exactamente qué está bien o mal.
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  compatible - true solo si no hay errors (warnings son ok)
 * @property {string[]} errors     - Razones que bloquean la instalación
 * @property {string[]} warnings   - Avisos informativos (no bloquean)
 */

/**
 * Valida si un NormalizedMod es compatible con una instancia
 *
 * @param {import('./metadata').NormalizedMod} mod
 * @param {object} instance - { version: string, loader: string, javaVersion?: number }
 * @returns {ValidationResult}
 */
export function validateModCompatibility(mod, instance) {
  const errors = [];
  const warnings = [];

  const { version: mcVersion, loader, javaVersion } = instance;

  // ── 1. Versión de Minecraft ───────────────────────────────────────────────
  if (mod.gameVersions.length > 0) {
    const exactMatch = mod.gameVersions.includes(mcVersion);
    if (!exactMatch) {
      // Intentar match por major.minor (ej: 1.20 coincide con 1.20.1)
      const majorMinor = mcVersion.split('.').slice(0, 2).join('.');
      const approxMatch = mod.gameVersions.some(v => v.startsWith(majorMinor));

      if (approxMatch) {
        warnings.push(
          `Mod no tiene soporte declarado para MC ${mcVersion} exacto, ` +
          `pero sí para una versión similar (${majorMinor}.x). Puede funcionar.`
        );
      } else {
        errors.push(
          `Incompatible con MC ${mcVersion}. ` +
          `Este mod soporta: ${summarizeVersions(mod.gameVersions)}`
        );
      }
    }
  }

  // ── 2. Mod Loader ─────────────────────────────────────────────────────────
  if (mod.loaders.length > 0 && loader !== 'vanilla') {
    const loaderLower = loader.toLowerCase();
    const loaderMatch = mod.loaders.includes(loaderLower);

    if (!loaderMatch) {
      // NeoForge <> Forge son parcialmente compatibles en versiones antiguas
      const isForgeCompat = (loaderLower === 'forge' && mod.loaders.includes('neoforge')) ||
                            (loaderLower === 'neoforge' && mod.loaders.includes('forge'));
      if (isForgeCompat) {
        warnings.push(
          `Mod es para ${mod.loaders.join('/')}, no para ${loader}. ` +
          `Forge/NeoForge son parcialmente compatibles pero puede haber problemas.`
        );
      } else {
        errors.push(
          `Incompatible con ${loader}. ` +
          `Este mod soporta: ${mod.loaders.join(', ')}`
        );
      }
    }
  }

  // ── 3. Versión de Java ────────────────────────────────────────────────────
  if (mod.minJava && javaVersion) {
    const required = parseInt(mod.minJava, 10);
    if (!isNaN(required) && javaVersion < required) {
      errors.push(
        `Requiere Java ${required}+, instancia configurada con Java ${javaVersion}.`
      );
    }
  }

  return {
    compatible: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valida un conjunto de mods ya instalados contra un mod nuevo
 * para detectar conflictos declarados explícitamente.
 *
 * @param {import('./metadata').NormalizedMod} incomingMod
 * @param {string[]} installedModIds - IDs de mods ya instalados en la instancia
 * @returns {{ conflicts: string[] }}
 */
export function detectConflicts(incomingMod, installedModIds) {
  const conflicts = [];
  const incompatible = incomingMod.dependencies.filter(d => d.type === 'incompatible');

  for (const dep of incompatible) {
    if (installedModIds.includes(dep.projectId)) {
      conflicts.push(
        `"${incomingMod.name}" declara incompatibilidad con el mod "${dep.projectId}" que ya tienes instalado.`
      );
    }
  }

  return { conflicts };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function summarizeVersions(versions) {
  if (versions.length <= 4) return versions.join(', ');
  return `${versions.slice(0, 3).join(', ')} ... (+${versions.length - 3} más)`;
}
