/** Step4Install — Paso 4: instalación del modpack con progreso y cierre */

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store';
import { getModpackDownloadUrl } from '../../lib/api/curseforge-modpacks';
import {
  getLauncherDir,
  downloadFile,
  extractZip,
  readFile,
  ensureDir,
  removeDir,
  copyDir,
} from '../../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../../lib/mods/curseforge-downloader';
import ProgressBar from '../ui/ProgressBar';
import './Step4Install.css';

export default function Step4Install({ source, pack, version, gameVersion, config, onClose }) {
  const { dispatch } = useStore();
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const performInstall = async () => {
      try {
        setProgressLabel('Obteniendo directorio del launcher...');
        setProgress(5);

        const launcherDir = await getLauncherDir();

        // Convertir "4GB" → 4096 MB, o usar el número directo
        const ramMb = typeof config.ram === 'string'
          ? parseInt(config.ram) * (config.ram.toLowerCase().includes('gb') ? 1024 : 1)
          : (config.ram || 2048);

        if (source === 'curseforge') {
          // ── CurseForge: descargar ZIP ──────────────────────────────────────
          setProgressLabel(`Descargando ${pack.name}...`);
          setProgress(10);

          const url = await getModpackDownloadUrl(pack.id, version.id);
          const modpacksDir = `${launcherDir}/modpacks`;
          await ensureDir(modpacksDir);
          const zipPath = `${modpacksDir}/${(pack.slug || pack.name).replace(/\s+/g, '-')}-${Date.now()}.zip`;

          await downloadFile(url, zipPath, null, pack.name || 'modpack');

          setProgressLabel('Extrayendo archivos...');
          setProgress(25);

          const tempDir = `${launcherDir}/temp-modpack-${Date.now()}`;
          await extractZip(zipPath, tempDir);

          try {
            setProgressLabel('Leyendo manifest...');
            setProgress(35);

            const instanceId = uuidv4();
            const instancePath = `${launcherDir}/instances/${instanceId}`;
            await ensureDir(instancePath);

            const manifestContent = await readFile(`${tempDir}/manifest.json`);
            const manifest = JSON.parse(manifestContent);

            const cfGameVersion = manifest.minecraft?.version || gameVersion || '1.20.1';
            const rawLoader = (manifest.minecraft?.modLoaders?.[0]?.id || '').toLowerCase();
            // CF modLoader id es algo como "forge-47.0.19", "fabric-0.14.21", etc.
            const loaderType = rawLoader.includes('neoforge') ? 'neoforge'
              : rawLoader.includes('forge') ? 'forge'
              : rawLoader.includes('fabric') ? 'fabric'
              : rawLoader.includes('quilt') ? 'quilt'
              : 'vanilla';
            // La versión del loader viene después del guion: "forge-47.0.19" → "47.0.19"
            const loaderVersion = manifest.minecraft?.modLoaders?.[0]?.id?.split('-').slice(1).join('-') || '';

            const newInstance = {
              id: instanceId,
              name: config.instanceName || pack.name,
              version: cfGameVersion,
              loader: loaderType,
              loaderVersion: loaderVersion,
              icon: config.icon || '📦',
              ram: ramMb,
              jvmArgs: config.jvmArgs || '',
              installed: false,
              createdAt: new Date().toISOString(),
              lastPlayed: null,
              playtime: 0,
              modsCount: manifest.files?.length || 0,
            };

            dispatch({ type: 'ADD_INSTANCE', payload: newInstance });

            // Copiar overrides/ → instancia (configs, scripts, resourcepacks, etc.)
            setProgressLabel('Copiando archivos de configuración (overrides)...');
            setProgress(45);
            await copyDir(`${tempDir}/overrides`, instancePath).catch(e =>
              console.warn('[Modpack CF] overrides no encontrados o error:', e)
            );

            // Descargar mods desde manifest.files
            if (manifest.files && manifest.files.length > 0) {
              const modsToGet = manifest.files
                .filter(f => f.required !== false)
                .map(f => ({ projectID: f.projectID, fileID: f.fileID, name: null }));

              const modsTotal = modsToGet.length;
              setProgressLabel(`Descargando ${modsTotal} mods...`);
              setProgress(55);

              await downloadMultipleModsFromCurseForge(
                launcherDir,
                instanceId,
                modsToGet,
                (info) => {
                  setProgress(55 + Math.round((info.done / modsTotal) * 40));
                  setProgressLabel(`Mod ${info.done}/${modsTotal}: ${info.label || ''}`);
                }
              );
            }

            dispatch({ type: 'UPDATE_INSTANCE', payload: { id: instanceId, installed: true } });
          } finally {
            try { await removeDir(tempDir); } catch {}
          }

          setProgress(100);
          setProgressLabel('¡Instalación completa!');
          setDone(true);

        } else {
          // ── Modrinth: descargar .mrpack ────────────────────────────────────
          setProgressLabel(`Descargando ${pack.title}...`);
          setProgress(10);

          const downloadUrl = version.files?.find(f => f.primary)?.url || version.files?.[0]?.url;
          if (!downloadUrl) throw new Error('No se encontró URL de descarga en la versión de Modrinth');

          const modpacksDir = `${launcherDir}/modpacks`;
          await ensureDir(modpacksDir);
          const mrpackPath = `${modpacksDir}/${(pack.slug || pack.title).replace(/\s+/g, '-')}-${Date.now()}.mrpack`;
          await downloadFile(downloadUrl, mrpackPath, null, pack.title || 'modpack');

          setProgressLabel('Extrayendo archivos...');
          setProgress(25);

          const mrTempDir = `${launcherDir}/temp-modpack-${Date.now()}`;
          await extractZip(mrpackPath, mrTempDir);

          try {
            setProgressLabel('Leyendo índice del modpack...');
            setProgress(35);

            const mrInstanceId = uuidv4();
            const mrInstancePath = `${launcherDir}/instances/${mrInstanceId}`;
            await ensureDir(mrInstancePath);

            const indexContent = await readFile(`${mrTempDir}/modrinth.index.json`);
            const modrinthIndex = JSON.parse(indexContent);

            // BUGFIX: modrinthIndex.game === "minecraft" (nombre del juego, NO la versión)
            // La versión MC real está en modrinthIndex.dependencies.minecraft
            const deps = modrinthIndex.dependencies || {};
            const mrGameVersion = deps.minecraft || gameVersion || '1.20.1';

            // Detectar loader: las keys reales en dependencies son 'fabric-loader', 'quilt-loader', 'forge', 'neoforge'
            let mrLoaderType = 'vanilla';
            let mrLoaderVersion = '';
            if (deps['fabric-loader'])  { mrLoaderType = 'fabric';   mrLoaderVersion = deps['fabric-loader']; }
            else if (deps['quilt-loader'])  { mrLoaderType = 'quilt';    mrLoaderVersion = deps['quilt-loader']; }
            else if (deps.forge)         { mrLoaderType = 'forge';    mrLoaderVersion = deps.forge; }
            else if (deps.neoforge)      { mrLoaderType = 'neoforge'; mrLoaderVersion = deps.neoforge; }

            const mrNewInstance = {
              id: mrInstanceId,
              name: config.instanceName || pack.title,
              version: mrGameVersion,
              loader: mrLoaderType,
              loaderVersion: mrLoaderVersion,
              icon: config.icon || '📦',
              ram: ramMb,
              jvmArgs: config.jvmArgs || '',
              installed: false,
              createdAt: new Date().toISOString(),
              lastPlayed: null,
              playtime: 0,
              modsCount: modrinthIndex.files?.length || 0,
            };

            dispatch({ type: 'ADD_INSTANCE', payload: mrNewInstance });

            // Copiar overrides/ → instancia
            setProgressLabel('Copiando archivos de configuración (overrides)...');
            setProgress(45);
            await copyDir(`${mrTempDir}/overrides`, mrInstancePath).catch(e =>
              console.warn('[Modpack MR] overrides no encontrados o error:', e)
            );

            // Descargar archivos del índice (mods + otros archivos)
            if (modrinthIndex.files && modrinthIndex.files.length > 0) {
              const mrFiles = modrinthIndex.files.filter(f => f.downloads?.length > 0);
              const mrTotal = mrFiles.length;
              setProgressLabel(`Descargando ${mrTotal} archivos...`);
              setProgress(55);

              for (let i = 0; i < mrFiles.length; i++) {
                const file = mrFiles[i];
                const fileUrl = file.downloads[0];
                // file.path puede ser "mods/sodium.jar" o "config/sodium.json"
                const relPath = file.path || `mods/file-${i}`;
                const destPath = `${mrInstancePath}/${relPath}`;
                // Asegurar que existe el subdirectorio destino
                const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
                await ensureDir(destDir).catch(() => {});
                setProgressLabel(`Descargando ${i + 1}/${mrTotal}: ${relPath.split('/').pop()}`);
                setProgress(55 + Math.round(((i + 1) / mrTotal) * 40));
                try {
                  await downloadFile(fileUrl, destPath, file.hashes?.sha1, relPath.split('/').pop());
                } catch (fileErr) {
                  console.warn(`[Modpack MR] Falló ${relPath}:`, fileErr.message);
                }
              }
            }

            dispatch({ type: 'UPDATE_INSTANCE', payload: { id: mrInstanceId, installed: true } });
          } finally {
            try { await removeDir(mrTempDir); } catch {}
          }

          setProgress(100);
          setProgressLabel('¡Instalación completa!');
          setDone(true);
        }
      } catch (err) {
        console.error('[ModpackImportWizard] Error en instalación:', err);
        setError(err?.message || 'Error en la instalación');
      }
    };

    performInstall();
  }, [source, pack, version, gameVersion, config, dispatch]);

  return (
    <div className="wizard-step-install">
      <h2>Instalando {pack.title || pack.name}</h2>

      <ProgressBar value={progress} />

      <div className="wizard-progress-label">{progressLabel}</div>

      {error && (
        <div className="wizard-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {done && (
        <div className="wizard-success">
          ✅ ¡Instalación completa! Tu modpack está listo para jugar.
          <button className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      )}

      {!done && !error && (
        <div className="wizard-installing">
          Por favor espera mientras instalamos el modpack...
        </div>
      )}
    </div>
  );
}
