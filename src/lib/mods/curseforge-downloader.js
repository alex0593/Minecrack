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
  const idStr = String(fileId);
  const part1 = idStr.substring(0, 4);
  const part2 = String(parseInt(idStr.substring(4)) || 0);
  return `https://mediafilez.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(fileName)}`;
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
    const modLabel = mod.name || `Mod ${mod.projectID}/${mod.fileID}`;
    try {
      onProgress?.({
        done: tasks.length,
        total,
        label: `Obteniendo URL: ${modLabel}`,
        percent: (tasks.length / total) * 10, // 0-10% para resolución
        downloaded: 0,
        failed: failedResolution.length,
        status: 'resolving',
      });

      // Obtener info del archivo desde la API
      const fileInfo = await getFile(mod.projectID, mod.fileID);

      let downloadUrl = fileInfo?.downloadUrl;
      const fileName = fileInfo?.fileName || `mod-${mod.fileID}.jar`;

      // Si la API no devuelve URL directa, construirla manualmente
      if (!downloadUrl || downloadUrl === 'null' || downloadUrl === null) {
        console.warn(`${LOG_PREFIX} Sin URL directa para ${modLabel}, usando URL alternativa`);
        downloadUrl = buildDirectDownloadUrl(mod.fileID, fileName);
      }

      const sha1 = extractSha1(fileInfo);
      const task = {
        url: downloadUrl,
        dest: `${modsDir}/${fileName}`,
        sha1: sha1 || null,
        label: mod.name || fileName.replace(/\.[^.]+$/, ''),
      };

      tasks.push(task);
      taskMeta.set(task, { projectID: mod.projectID, fileID: mod.fileID, fileName });
      console.log(`${LOG_PREFIX} ✓ URL resuelta: ${fileName}`);

    } catch (err) {
      console.error(`${LOG_PREFIX} Error resolviendo URL para ${modLabel}:`, err.message);
      failedResolution.push({ projectID: mod.projectID, fileID: mod.fileID, error: err.message });
      results.push({
        success: false,
        projectID: mod.projectID,
        fileID: mod.fileID,
        modName: modLabel,
        error: err.message,
      });
    }
  }

  if (tasks.length === 0) {
    console.warn(`${LOG_PREFIX} No hay tareas de descarga válidas`);
    return { downloaded: 0, failed: failedResolution.length, total, results };
  }

  // ── Descargar con cola paralela (máx 4 concurrentes) ────────────────────
  let downloaded = failedResolution.length; // conteo base por los que fallaron en resolución
  let failed = failedResolution.length;

  return new Promise((resolve) => {
    const queue = downloadQueue({
      tasks,
      concurrency: 4,
      onProgress: (info) => {
        downloaded = info.done;
        failed = info.failed + failedResolution.length;

        onProgress?.({
          done: info.done,
          total: tasks.length,
          label: info.label,
          percent: 10 + (info.done / tasks.length) * 90, // 10-100%
          downloaded: info.done,
          failed,
          status: 'progress',
        });
      },
      onDone: () => {
        console.log(`${LOG_PREFIX} ✓ Descarga completada: ${downloaded}/${tasks.length} mods`);

        // Agregar resultados exitosos
        for (const task of tasks) {
          const meta = taskMeta.get(task);
          results.push({
            success: true,
            projectID: meta.projectID,
            fileID: meta.fileID,
            modName: task.label,
            fileName: meta.fileName,
          });
        }

        resolve({
          downloaded: tasks.length - (failed - failedResolution.length),
          failed,
          total,
          results,
        });
      },
      onError: (err) => {
        console.error(`${LOG_PREFIX} Error en cola:`, err);
      },
    });

    queue.run().catch((err) => {
      console.error(`${LOG_PREFIX} Error ejecutando cola:`, err);
      resolve({
        downloaded,
        failed: total - downloaded,
        total,
        results,
      });
    });
  });
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
