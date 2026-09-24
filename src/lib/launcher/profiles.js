// profiles.js — Loader profile helpers + session Java cache (split out of launcher.js)
// File-level exports are for internal use inside src/lib/launcher/ only — NOT re-exported by the barrel.

import { readFile, fileExists } from '../tauri';
import { installLoader } from '../loaders';
import { downloadQueue } from '../downloader';
import { LAUNCHER } from '../../config';

// ─── Java session cache (P1.3 optimization) ───────────────────────────────────
// Memoize resolved Java path per major version for the duration of the session.
// Re-scan only if unset or validation fails (double-validation in java-repair is intentional).
const _javaCacheByVersion = {};

function getLoaderProfileId(instance) {
  const { loader, loaderVersion, version } = instance;
  if (!loaderVersion || loader === 'vanilla') return null;

  // New format: loaderVersion already IS the full profileId (contains loader name embedded)
  // E.g., "1.20.1-fabric-0.19.2", "1.20.1-neoforge-47.1.106" — use as-is to avoid double prefix
  if (loader === 'fabric'   && loaderVersion.includes('-fabric-'))   return loaderVersion;
  if (loader === 'quilt'    && loaderVersion.includes('-quilt-'))     return loaderVersion;
  if (loader === 'neoforge' && loaderVersion.includes('-neoforge-')) return loaderVersion;

  // Legacy/bare format — build the profileId from parts
  if (loader === 'fabric')   return `${version}-fabric-${loaderVersion}`;
  if (loader === 'quilt')    return `${version}-quilt-${loaderVersion}`;
  if (loader === 'neoforge') return `${version}-neoforge-${loaderVersion}`;
  if (loader === 'forge')    return loaderVersion; // Forge: loaderVersion IS the profileId (e.g., "1.19.2-43.5.0")
  return null;
}

/**
 * Auto-repair legacy Forge/NeoForge profiles (without formatVersion: 2)
 */
async function ensureLoaderProfileUpToDate(instance, launcherDir, versionData, onRepairProgress) {
  if (instance.loader !== 'forge' && instance.loader !== 'neoforge') return false;
  const profileId = getLoaderProfileId(instance);
  if (!profileId) return false;

  const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;
  let needsRepair = false;
  let reason = '';

  if (!(await fileExists(profilePath))) {
    needsRepair = true;
    reason = 'perfil no encontrado';
  } else {
    try {
      const existing = JSON.parse(await readFile(profilePath));
      if (!existing.formatVersion || existing.formatVersion < 2) {
        needsRepair = true;
        reason = `formatVersion=${existing.formatVersion ?? 'undefined'} (legacy)`;
      } else {
        // Detectar perfil ForgeWrapper sin mavenFiles: el installer no puede ejecutarse sin ellos.
        // Ocurre cuando el perfil fue generado por una versión anterior del launcher (sin soporte mavenFiles).
        const isForgeWrapper = existing.mainClass?.toLowerCase().includes('forgewrapper');
        if (isForgeWrapper && !(existing.mavenFiles?.length > 0)) {
          needsRepair = true;
          reason = 'ForgeWrapper detectado pero mavenFiles ausentes';
        }
      }
    } catch (err) {
      needsRepair = true;
      reason = `perfil ilegible: ${err.message}`;
    }
  }

  if (!needsRepair) return false;

  console.log(`[Launcher] Auto-reparación de ${instance.loader}: ${reason}`);
  onRepairProgress?.({ phase: 'start', label: `Reparando instalación de ${instance.loader}…`, percent: 0 });

  // Extract the bare loader version from the composite profileId so installLoader
  // can query Prism Meta correctly. E.g., "1.20.1-neoforge-47.1.106" → "47.1.106"
  const { extractRealVersion } = await import('../loader-repair.js');
  const realLoaderVersion = extractRealVersion(instance.loader, instance.loaderVersion);
  console.log(`[Launcher] Reparando ${instance.loader} con versión real: ${realLoaderVersion} (desde "${instance.loaderVersion}")`);

  const result = await installLoader(
    instance.loader,
    realLoaderVersion,
    instance.version,
    launcherDir,
    versionData,
  );

  if (result.downloadTasks?.length > 0) {
    onRepairProgress?.({ phase: 'download', label: `Descargando ${result.downloadTasks.length} archivos…`, percent: 5 });
    await new Promise((resolve, reject) => {
      const q = downloadQueue({
        tasks: result.downloadTasks,
        concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
        onProgress: (p) => {
          const pct = 5 + Math.round((p.done / p.total) * 90);
          onRepairProgress?.({ phase: 'download', label: p.label, percent: pct, done: p.done, total: p.total });
        },
        onDone: ({ failed }) => {
          if (failed > 0) reject(new Error(`${failed} archivos fallaron al descargar`));
          else resolve();
        },
      });
      q.run();
    });
  }

  onRepairProgress?.({ phase: 'done', label: 'Reparación completada', percent: 100 });
  console.log(`[Launcher] Auto-reparación completada: ${result.downloadTasks?.length ?? 0} archivos descargados`);
  return true;
}

// Internal exports for src/lib/launcher/ (deliberately NOT part of the barrel API).
export { _javaCacheByVersion, getLoaderProfileId, ensureLoaderProfileUpToDate };
