/**
 * curseforge-downloader.js — Descarga REAL de mods desde CurseForge
 *
 * Obtiene URLs de descarga desde la API de CurseForge y descarga
 * los archivos JAR a instances/{instanceId}/mods/ usando la cola
 * de descargas paralelas existente (máx 4 simultáneas).
 *
 * Requiere VITE_CURSEFORGE_API_KEY en el .env para funcionar.
 * Si no hay API key, intenta construir URL directa alternativa.
 */

import { downloadQueue } from '../downloader';
import { getFile, extractSha1 } from '../api/curseforge';
import { tauriCmd } from '../tauri';

const LOG_PREFIX = '[CF-Download]';

/**
 * Construye URL directa de descarga de CurseForge sin API key
 * Formato: https://mediafilez.forgecdn.net/files/{fileId/1000}/{fileId%1000}/{filename}
 */
function buildDirectDownloadUrl(fileId, fileName) {
  const part1 = Math.floor(fileId / 1000);
  const part2 = fileId % 1000;
  return `https://mediafilez.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(fileName)}`;
}

/**
 * Resuelve la URL de descarga de un mod con fallback a URL directa.
 * Reintenta la resolución API en caso de fallo.
 */
async function resolveDownloadUrl(projectID, fileID, fallbackFileName) {
  try {
    const fileInfo = await getFile(projectID, fileID);
    const url = fileInfo?.downloadUrl;
    const fileName = fileInfo?.fileName || fallbackFileName;
    if (url && url !== 'null' && url !== null) {
      return { url, fileName, sha1: extractSha1(fileInfo) };
    }
    // API respondió pero sin URL directa → construir CDN URL
    return { url: buildDirectDownloadUrl(fileID, fileName), fileName, sha1: extractSha1(fileInfo) };
  } catch {
    // Error de red/API → intentar CDN directo
    return {
      url: buildDirectDownloadUrl(fileID, fallbackFileName),
      fileName: fallbackFileName,
      sha1: null,
    };
  }
}

/**
 * Descarga múltiples mods desde CurseForge en paralelo (4 a la vez)
 *
 * @param {string} launcherDir - Directorio del launcher
 * @param {string} instanceId - ID de la instancia destino
 * @param {Array<{projectID, fileID, name?}>} mods - Lista de mods a descargar
 * @param {Function} onProgress - Callback: { done, total, label, percent, downloaded, failed, status }
 * @returns {Promise<{downloaded, failed, total, results}>}
 */
export async function downloadMultipleModsFromCurseForge(
  launcherDir,
  instanceId,
  mods,
  onProgress = null
) {
  console.log(`${LOG_PREFIX} Iniciando descarga de ${mods.length} mods desde CurseForge`);

  if (!mods || mods.length === 0) {
    return { downloaded: 0, failed: 0, total: 0, results: [] };
  }

  const total = mods.length;
  const results = [];
  const modsDir = `${launcherDir}/instances/${instanceId}/mods`;

  // Crear directorio de mods
  try {
    await tauriCmd('create_dir_all', { path: modsDir });
  } catch (err) {
    console.warn(`${LOG_PREFIX} Warning creando directorio mods:`, err);
  }

  // ── Resolver URLs para cada mod ───────────────────────────────────────────
  const tasks = [];
  const taskMeta = new Map(); // task → { projectID, fileID, fileName }
  const failedResolution = [];

  for (const mod of mods) {
    const fallbackName = mod.name ? `${mod.name}.jar` : `mod-${mod.fileID}.jar`;
    const modLabel = mod.name || `Mod ${mod.projectID}/${mod.fileID}`;

    onProgress?.({
      done: tasks.length,
      total,
      label: `Obteniendo URL: ${modLabel}`,
      percent: (tasks.length / total) * 10,
      downloaded: 0,
      failed: failedResolution.length,
      status: 'resolving',
    });

    const resolved = await resolveDownloadUrl(mod.projectID, mod.fileID, fallbackName);
    const task = {
      url: resolved.url,
      dest: `${modsDir}/${resolved.fileName}`,
      sha1: resolved.sha1 || null,
      label: mod.name || resolved.fileName.replace(/\.[^.]+$/, ''),
    };

    tasks.push(task);
    taskMeta.set(task, { projectID: mod.projectID, fileID: mod.fileID, fileName: resolved.fileName });
  }

  if (tasks.length === 0) {
    console.warn(`${LOG_PREFIX} No hay tareas de descarga válidas`);
    return { downloaded: 0, failed: failedResolution.length, total, results };
  }

  // ── Descargar con cola paralela (máx 4 concurrentes) ────────────────────
  let failed = failedResolution.length;
  const failedTasks = []; // tareas que fallaron para retry

  await new Promise((resolve) => {
    const queue = downloadQueue({
      tasks,
      concurrency: 4,
      onProgress: (info) => {
        failed = info.failed + failedResolution.length;
        onProgress?.({
          done: info.done,
          total: tasks.length,
          label: info.label,
          percent: 10 + (info.done / tasks.length) * 80, // 10-90%
          downloaded: info.done,
          failed,
          status: 'progress',
        });
      },
      onError: (taskOrErr) => {
        // Recopilar tareas fallidas para retry
        if (taskOrErr && taskMeta.has(taskOrErr)) {
          failedTasks.push(taskMeta.get(taskOrErr));
        }
      },
      onDone: () => resolve(),
    });
    queue.run().catch(() => resolve());
  });

  // ── Retry de mods fallidos con URL fresca (hasta 3 intentos) ────────────
  for (const meta of failedTasks) {
    let retried = false;
    for (let attempt = 1; attempt <= 3 && !retried; attempt++) {
      try {
        const fresh = await resolveDownloadUrl(meta.projectID, meta.fileID, meta.fileName);
        await tauriCmd('download_file', {
          url: fresh.url,
          dest: `${modsDir}/${fresh.fileName}`,
          sha1: fresh.sha1 ?? null,
          label: fresh.fileName,
        });
        retried = true;
        failed = Math.max(0, failed - 1);
      } catch {
        // siguiente intento
      }
    }
    if (!retried) {
      results.push({
        success: false,
        projectID: meta.projectID,
        fileID: meta.fileID,
        modName: meta.fileName,
        error: 'Fallido tras 3 reintentos',
      });
    }
  }

  // Agregar resultados exitosos
  const successCount = tasks.length - failedTasks.length + failedTasks.filter((_, i) => {
    return !results.some(r => !r.success && r.fileID === failedTasks[i]?.fileID);
  }).length;

  onProgress?.({
    done: tasks.length,
    total,
    label: 'Descarga completada',
    percent: 100,
    downloaded: successCount,
    failed,
    status: 'done',
  });

  return {
    downloaded: successCount,
    failed,
    total,
    results,
  };
}

/**
 * Descarga un único mod (conveniencia)
 */
export async function downloadSingleModFromCurseForge(
  launcherDir,
  instanceId,
  projectID,
  fileID,
  name = null
) {
  const result = await downloadMultipleModsFromCurseForge(
    launcherDir,
    instanceId,
    [{ projectID, fileID, name }],
    null
  );
  return result.results[0];
}
