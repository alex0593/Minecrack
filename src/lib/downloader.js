/**
 * downloader.js — Sistema de descargas con cola y progreso
 *
 * Orquesta múltiples descargas con límite de concurrencia,
 * reintentos automáticos, verificación SHA1 (vía Rust),
 * y eventos de progreso para la UI.
 *
 * Uso:
 *   import { downloadQueue } from './downloader';
 *
 *   const queue = downloadQueue({
 *     tasks: [...],
 *     onProgress: ({ done, total, label, percent }) => ...,
 *     onError:    (err) => ...,
 *   });
 *   await queue.run();
 */

import { downloadFile, fileExists, writeFile, tauriCmd, extractZip } from './tauri';
import { LAUNCHER } from '../config';
import { downloadFileWithFallback } from './instances';

// ─────────────────────────────────────────────────────────────────────────────
// downloadQueue — Cola de descarga con concurrencia limitada
// ─────────────────────────────────────────────────────────────────────────────
export function downloadQueue({ tasks, onProgress, onError, onDone, concurrency }) {
  const MAX = concurrency ?? LAUNCHER.MAX_CONCURRENT_DOWNLOADS;
  let done = 0;
  let failed = 0;
  const total = tasks.length;

  async function processTask(task) {
    try {
      // Archivos sin URL se escriben desde content (ej: version JSON)
      if (!task.url && task.content) {
        await writeFile(task.dest, task.content);
        done++;
        onProgress?.({ done, total, failed, label: task.label, percent: (done / total) * 100 });
        return;
      }

      // Verificar si ya existe con el hash correcto → skip
      if (task.sha1) {
        const exists = await fileExists(task.dest, task.sha1);
        if (exists) {
          done++;
          onProgress?.({ done, total, failed, label: task.label, percent: (done / total) * 100 });
          return;
        }
      }

      // Descargar con fallback a Maven Central si está disponible
      if (task.libPath) {
        // Usa el helper con fallback para librerías
        await downloadFileWithFallback(task.url, task.dest, task.sha1, task.label, tauriCmd, task.libPath);
      } else {
        // Descarga normal sin fallback
        await downloadFile(task.url, task.dest, task.sha1, task.label);
      }
      done++;
      onProgress?.({ done, total, failed, label: task.label, percent: (done / total) * 100 });

    } catch (err) {
      failed++;
      console.error(`[downloader] Error en ${task.label}:`, err);
      onError?.({ task, error: err.toString() });
    }
  }

  return {
    /** Ejecuta todas las descargas con el límite de concurrencia */
    async run() {
      const queue = [...tasks];
      const workers = [];

      // Lanzar `MAX` workers en paralelo
      for (let i = 0; i < Math.min(MAX, queue.length); i++) {
        workers.push(worker());
      }

      async function worker() {
        while (queue.length > 0) {
          const task = queue.shift();
          if (task) await processTask(task);
        }
      }

      await Promise.all(workers);
      onDone?.({ done, failed, total });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// installVersion — Descarga todo lo necesario para una versión de MC
// ─────────────────────────────────────────────────────────────────────────────
import { buildDownloadList } from './mojang';

/**
 * @param {string}   versionId    - Ej: "1.21.1"
 * @param {string}   launcherDir  - Directorio base del launcher
 * @param {object}   instance     - Instancia con loader info: { id, loader, loaderVersion }
 * @param {function} onProgress   - Callback de progreso: { done, total, label, phase }
 * @param {function} onError      - Callback de error: { task, error }
 * @returns {{ versionData, assetIndexInfo, loaderVersion }}
 */
export async function installVersion(versionId, launcherDir, instance, onProgress, onError) {
  onProgress?.({ done: 0, total: 0, label: 'Obteniendo lista de archivos...', phase: 'init', percent: 0 });

  // 1. Construir lista de archivos (client.jar + libraries + version JSON)
  const { tasks, versionData, assetIndexInfo } = await buildDownloadList(versionId, launcherDir);

  // 2. Descargar archivos base
  await new Promise((resolve, reject) => {
    const q = downloadQueue({
      tasks,
      concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
      onProgress: (p) => onProgress?.({ ...p, phase: 'libraries' }),
      onError,
      onDone: ({ failed }) => {
        if (failed > 0) reject(new Error(`${failed} archivos fallaron`));
        else resolve();
      },
    });
    q.run();
  });

  // 3. Extraer natives si los hay
  onProgress?.({ done: 0, total: 0, label: 'Extrayendo librerías nativas...', phase: 'natives', percent: 0 });
  try {
    const nativesTasks = tasks.filter(t => t.isNative);
    if (nativesTasks.length > 0 && instance?.id) {
      const nativesDir = `${launcherDir}/instances/${instance.id}/natives`;
      for (const task of nativesTasks) {
        await extractZip(task.dest, nativesDir);
        onProgress?.({ done: 1, total: 1, label: `Extraído: ${task.label}`, phase: 'natives', percent: 100 });
      }
    }
  } catch (err) {
    console.warn('[installVersion] Error extrayendo natives:', err);
    // No rechazar, los natives son opcionales en algunos casos
  }

  // 4. Instalar loader si no es vanilla
  let loaderVersion = null;
  let actualGameVersion = versionId;
  if (instance?.loader && instance.loader !== 'vanilla') {
    onProgress?.({ done: 0, total: 0, label: `Instalando ${instance.loader}...`, phase: 'loader', percent: 0 });

    try {
      const { installLoader } = await import('./loaders');
      const loaderResult = await installLoader(
        instance.loader,
        instance.loaderVersion || 'latest',
        versionId,
        launcherDir,
        versionData
      );
      loaderVersion = loaderResult.loaderVersion;
      // Si el loader usó una versión compatible, actualizar
      if (loaderResult.actualGameVersion && loaderResult.actualGameVersion !== versionId) {
        console.log(`[downloader] Loader usó versión compatible: MC ${loaderResult.actualGameVersion} en lugar de ${versionId}`);
        actualGameVersion = loaderResult.actualGameVersion;
      }

      // Descargar librerías del loader si existen
      if (loaderResult.downloadTasks && loaderResult.downloadTasks.length > 0) {
        console.log(`[downloader] Descargando librerías de ${instance.loader}...`);
        await new Promise((resolve, reject) => {
          const q = downloadQueue({
            tasks: loaderResult.downloadTasks,
            concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
            onProgress: (p) => onProgress?.({ ...p, phase: 'loader-libs' }),
            onError,
            onDone: ({ failed }) => {
              if (failed > 0) reject(new Error(`${failed} librerías de loader fallaron`));
              else resolve();
            },
          });
          q.run();
        });
      }
    } catch (err) {
      console.error('[downloader] Error instalando loader:', err);
      onError?.({ task: { label: instance.loader }, error: err.toString() });
      throw err;
    }
  }

  return { versionData, assetIndexInfo, loaderVersion, actualGameVersion };
}

// ─────────────────────────────────────────────────────────────────────────────
// installAssets — Descarga los assets del juego (sonidos, texturas)
// Se llama separado porque son muchos archivos (~3000)
// ─────────────────────────────────────────────────────────────────────────────
import { buildAssetDownloadList } from './mojang';

export async function installAssets(assetIndexInfo, launcherDir, onProgress, onError) {
  onProgress?.({ done: 0, total: 0, label: 'Preparando assets...', phase: 'assets', percent: 0 });

  try {
    const tasks = await buildAssetDownloadList(assetIndexInfo, launcherDir);

    await new Promise((resolve, reject) => {
      const q = downloadQueue({
        tasks,
        concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
        onProgress: (p) => onProgress?.({ ...p, phase: 'assets' }),
        onError,
        onDone: ({ failed }) => {
          if (failed > 0) reject(new Error(`${failed} assets fallaron`));
          else resolve();
        },
      });
      q.run();
    });
  } catch (err) {
    console.error('[installAssets] Error:', err);
    throw err;
  }
}
