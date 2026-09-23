/**
 * ModpackDownloadModal.jsx — Descargar e instalar modpacks desde CurseForge
 *
 * Flujo completo:
 * 1. Búsqueda de modpacks
 * 2. Selección de modpack + versión
 * 3. Preview del contenido
 * 4. Descarga del ZIP
 * 5. Extracción e importación como instancia
 * 6. Descarga de mods en paralelo
 * 7. Instancia lista para jugar
 */

import { useState } from 'react';
import { useDispatch } from '../store';
import {
  searchModpacks,
  getModpackWithVersions,
  getModpackDownloadUrl,
} from '../lib/api/curseforge-modpacks';
import {
  downloadFile,
  pickFolder,
  getLauncherDir,
  extractZip,
  inspectInstanceFolder,
  importInstanceFromFolder,
  getModsToDownload,
} from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import './ModpackDownloadModal.css';
import ErrorView from './modpack-download-modal/ErrorView';
import ProgressView from './modpack-download-modal/ProgressView';
import PreviewView from './modpack-download-modal/PreviewView';
import SearchView from './modpack-download-modal/SearchView';

export default function ModpackDownloadModal({ onClose }) {
  const { dispatch } = useDispatch();

  // Estados del flujo
  const [step, setStep] = useState('search'); // search | loading | selecting | previewing | downloading | installing-mods | done | error
  const [searchQuery, setSearchQuery] = useState('');
  const [gameVersion, setGameVersion] = useState('1.20.1');
  const [modpacks, setModpacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState(null);

  // Estado interno
  const [launcherDir, setLauncherDir] = useState(null);
  const [importedInstanceId, setImportedInstanceId] = useState(null);
  const [modsToDownload, setModsToDownload] = useState([]);
  const [modsDownloaded, setModsDownloaded] = useState(0);
  const [modsFailed, setModsFailed] = useState(0);

  // ─── Fase 1: Búsqueda ──────────────────────────────────────────────────────

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setModpacks([]);
    setSelectedModpack(null);

    try {
      console.log('[ModpackDownloadModal] Searching modpacks:', { searchQuery, gameVersion });

      const result = await searchModpacks(searchQuery, {
        gameVersion,
        limit: 12,
      });

      console.log('[ModpackDownloadModal] Search result:', result);
      setModpacks(result.data || []);

      if (!result.data || result.data.length === 0) {
        setError({
          message: `No se encontraron modpacks para "${searchQuery}"`,
          details: 'Intenta con otro término de búsqueda',
        });
      }
    } catch (err) {
      console.error('[ModpackDownloadModal] Search error:', err);
      setError({
        message: 'Error buscando modpacks',
        details: err?.message || 'Error desconocido',
      });
    } finally {
      setLoading(false);
    }
  };

  // ─── Fase 2: Selección de modpack ──────────────────────────────────────────

  const handleSelectModpack = async (modpack) => {
    setLoading(true);
    setSelectedModpack(modpack);
    setSelectedVersion(null);
    setVersions([]);

    try {
      console.log('[ModpackDownloadModal] Loading versions for:', modpack.name);

      const result = await getModpackWithVersions(modpack.id, gameVersion);
      console.log('[ModpackDownloadModal] Versions loaded:', result);

      setVersions(result.versions || []);
      if (result.bestVersion) {
        setSelectedVersion(result.bestVersion);
        setStep('previewing');
      }
    } catch (err) {
      console.error('[ModpackDownloadModal] Error loading versions:', err);
      setError({
        message: 'Error cargando versiones del modpack',
        details: err?.message || 'Error desconocido',
      });
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Fase 3: Descarga e instalación ───────────────────────────────────────

  const handleInstall = async () => {
    if (!selectedModpack || !selectedVersion) {
      console.warn('[ModpackDownloadModal] Missing modpack or version');
      return;
    }

    try {
      setStep('downloading');
      setProgress(0);
      setProgressLabel('Obteniendo directorio del launcher...');

      const dir = await getLauncherDir();
      setLauncherDir(dir);

      // Paso 1: Descargar ZIP del modpack
      setProgressLabel(`Descargando ${selectedModpack.name}...`);
      console.log('[ModpackDownloadModal] Getting download URL');

      const downloadUrl = await getModpackDownloadUrl(
        selectedModpack.id,
        selectedVersion.id
      );
      console.log('[ModpackDownloadModal] Download URL:', downloadUrl);

      const zipPath = `${dir}/modpacks/${selectedModpack.slug}-${selectedVersion.id}.zip`;
      console.log('[ModpackDownloadModal] Downloading to:', zipPath);

      setProgress(10);
      await downloadFile(downloadUrl, zipPath, null, `Descargando modpack`);
      setProgress(30);

      // Paso 2: Extraer a carpeta temporal
      setProgressLabel('Extrayendo archivos...');
      const tempDir = `${dir}/temp-modpack-${Date.now()}`;
      console.log('[ModpackDownloadModal] Extracting to:', tempDir);

      await extractZip(zipPath, tempDir);
      setProgress(50);

      // Paso 3: Inspeccionar instancia
      setProgressLabel('Inspeccionar contenido...');
      console.log('[ModpackDownloadModal] Inspecting instance');

      const preview = await inspectInstanceFolder(tempDir);
      console.log('[ModpackDownloadModal] Preview:', preview);
      setProgress(60);

      // Paso 4: Importar instancia
      setProgressLabel('Importando instancia...');
      const importResult = await importInstanceFromFolder(
        dir,
        tempDir,
        selectedModpack.name
      );
      console.log('[ModpackDownloadModal] Import result:', importResult);

      setImportedInstanceId(importResult.newInstanceId);
      setProgress(70);

      // Agregar instancia al store
      const newInstance = {
        id: importResult.newInstanceId,
        name: selectedModpack.name,
        version: preview?.version || '1.20.1',
        loader: preview?.loader || 'forge',
        icon: '📦',
        installed: true,
        lastPlayed: new Date().toISOString(),
      };

      console.log('[ModpackDownloadModal] Adding instance to store:', newInstance);
      dispatch({ type: 'ADD_INSTANCE', payload: newInstance });

      // Paso 5: Obtener mods a descargar
      setProgressLabel('Obteniendo lista de mods...');
      console.log('[ModpackDownloadModal] Getting mods to download');

      const mods = await getModsToDownload(tempDir);
      console.log('[ModpackDownloadModal] Mods to download:', mods);

      setModsToDownload(mods || []);
      setProgress(75);

      // Paso 6: Descargar mods si los hay
      if (mods && mods.length > 0) {
        setStep('installing-mods');
        await handleDownloadMods(dir, importResult.newInstanceId, mods);
      } else {
        console.log('[ModpackDownloadModal] No mods to download');
        setProgress(100);
        setStep('done');

        setTimeout(() => {
          console.log('[ModpackDownloadModal] Closing modal');
          onClose();
        }, 2000);
      }
    } catch (err) {
      console.error('[ModpackDownloadModal] Error in handleInstall:', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Error desconocido');
      const errorDetails = err?.stack || (typeof err === 'string' ? '' : JSON.stringify(err));
      setError({
        message: `Error descargando/importando modpack: ${errorMessage}`,
        details: errorDetails,
      });
      setStep('error');
    }
  };

  const handleDownloadMods = async (dir, instanceId, mods) => {
    console.log('[ModpackDownloadModal] Starting mod downloads:', { modsCount: mods.length });

    try {
      const result = await downloadMultipleModsFromCurseForge(
        dir,
        instanceId,
        mods,
        (info) => {
          console.log('[ModpackDownloadModal] Mod progress:', info);

          if (info.status === 'progress') {
            const modPercent = (info.done / info.total) * 25; // 75-100%
            setProgress(75 + modPercent);
            setProgressLabel(
              `Descargando mods (${info.done}/${info.total}): ${info.label}`
            );
            setModsDownloaded(info.downloaded || 0);
            setModsFailed(info.failed || 0);
          }
        }
      );

      console.log('[ModpackDownloadModal] Mods download complete:', result);
      setModsDownloaded(result.downloaded);
      setModsFailed(result.failed);
      setProgress(100);

      // Transitar a done
      setTimeout(() => {
        setStep('done');
        setTimeout(() => {
          console.log('[ModpackDownloadModal] Closing modal');
          onClose();
        }, 2000);
      }, 500);
    } catch (err) {
      console.error('[ModpackDownloadModal] Error downloading mods:', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Error desconocido');
      const errorDetails = err?.stack || (typeof err === 'string' ? '' : JSON.stringify(err));
      setError({
        message: `Error descargando mods: ${errorMessage}`,
        details: errorDetails,
      });
      setStep('error');
    }
  };

  // ─── UI: Error Modal ───────────────────────────────────────────────────────

  if (error && step === 'error') {
    return (
      <ErrorView
        error={error}
        onClose={() => {
          setError(null);
          setStep('search');
        }}
      />
    );
  }

  // ─── UI: Descargando/Instalando ───────────────────────────────────────────

  if (step === 'downloading' || step === 'installing-mods' || step === 'done') {
    return (
      <ProgressView
        step={step}
        selectedModpack={selectedModpack}
        progress={progress}
        progressLabel={progressLabel}
        modsToDownload={modsToDownload}
        modsDownloaded={modsDownloaded}
        modsFailed={modsFailed}
        onClose={onClose}
      />
    );
  }

  // ─── UI: Preview ──────────────────────────────────────────────────────────

  if (step === 'previewing' && selectedModpack && selectedVersion) {
    return (
      <PreviewView
        selectedModpack={selectedModpack}
        selectedVersion={selectedVersion}
        loading={loading}
        onClose={onClose}
        onBack={() => {
          setSelectedModpack(null);
          setSelectedVersion(null);
          setStep('search');
        }}
        onInstall={handleInstall}
      />
    );
  }

  // ─── UI: Selección de modpack ──────────────────────────────────────────────

  if (step === 'search' || step === 'loading' || step === 'selecting') {
    return (
      <SearchView
        onClose={onClose}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        gameVersion={gameVersion}
        setGameVersion={setGameVersion}
        loading={loading}
        modpacks={modpacks}
        handleSearch={handleSearch}
        handleSelectModpack={handleSelectModpack}
      />
    );
  }

  return null;
}
