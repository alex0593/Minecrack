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
import { useStore } from '../store';
import {
  searchModpacks,
  getModpackWithVersions,
  getModpackDownloadUrl,
  isCurseForgeConfigured,
  formatModpackInfo,
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
import ProgressBar from './ui/ProgressBar';
import ErrorModal from './ui/ErrorModal';
import './ModpackDownloadModal.css';

export default function ModpackDownloadModal({ onClose }) {
  const { dispatch } = useStore();

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
      <ErrorModal
        message={error.message}
        details={error.details}
        onClose={() => {
          setError(null);
          setStep('search');
        }}
        open
      />
    );
  }

  // ─── UI: Descargando/Instalando ───────────────────────────────────────────

  if (step === 'downloading' || step === 'installing-mods' || step === 'done') {
    return (
      <div className="modal-overlay">
        <div className="modal-content modpack-download-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>
              {step === 'done'
                ? '✓ Modpack instalado'
                : '📥 Instalando modpack'}
            </h2>
          </div>

          <div className="modal-body" style={{ paddingTop: 24 }}>
            {step === 'done' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12 }}>
                  ✓
                </div>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, margin: 0 }}>
                  {selectedModpack?.name}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, margin: 0 }}>
                  Modpack instalado correctamente
                </p>
                {modsDownloaded > 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, margin: 0 }}>
                    {modsDownloaded} mod{modsDownloaded === 1 ? '' : 's'} descargado
                    {modsDownloaded === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            ) : (
              <>
                <ProgressBar
                  value={progress}
                  max={100}
                  label={`${Math.round(progress)}%`}
                  animated
                  style={{ marginBottom: 16 }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {progressLabel}
                </p>
                {step === 'installing-mods' && modsToDownload.length > 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                    {modsDownloaded}/{modsToDownload.length} mods descargados
                    {modsFailed > 0 && (
                      <span style={{ color: 'var(--red)' }}>
                        ({modsFailed} fallido{modsFailed === 1 ? '' : 's'})
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>

          {step !== 'done' && (
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose} disabled>
                Por favor espera...
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── UI: Preview ──────────────────────────────────────────────────────────

  if (step === 'previewing' && selectedModpack && selectedVersion) {
    const info = formatModpackInfo(selectedModpack, selectedVersion);

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content modpack-download-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>📦 {selectedModpack.name}</h2>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            {selectedModpack.logo && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <img
                  src={selectedModpack.logo}
                  alt={selectedModpack.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '120px',
                    borderRadius: '4px',
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Descripción</h3>
              <p
                style={{
                  margin: 0,
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {info.description}
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Información</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Versión:</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {info.versionName}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Tipo:</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {info.releaseType}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>MC Versión:</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {info.gameVersions?.join(', ') || 'No especificada'}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Tamaño:</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {formatFileSize(info.fileSize)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSelectedModpack(null);
                setSelectedVersion(null);
                setStep('search');
              }}
            >
              Atrás
            </button>
            <button
              className="btn btn-primary"
              onClick={handleInstall}
              disabled={loading}
            >
              📥 Descargar e instalar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── UI: Selección de modpack ──────────────────────────────────────────────

  if (step === 'search' || step === 'loading' || step === 'selecting') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content modpack-download-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>⬇️ Descargar modpack desde CurseForge</h2>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            {!isCurseForgeConfigured() && (
              <div
                style={{
                  backgroundColor: 'var(--bg-warning)',
                  border: '1px solid var(--text-warning)',
                  padding: 12,
                  borderRadius: 4,
                  marginBottom: 16,
                  fontSize: 12,
                  color: 'var(--text-warning)',
                }}
              >
                ⚠️ CurseForge API no está configurada. Necesitas una API key gratuita en .env
              </div>
            )}

            <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Buscar modpack
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Create, All The Mods..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loading}
                  style={{ marginBottom: 8 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Versión Minecraft (opcional)
                </label>
                <select
                  className="input"
                  value={gameVersion}
                  onChange={(e) => setGameVersion(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Cualquier versión</option>
                  <option value="1.21">1.21</option>
                  <option value="1.20.1">1.20.1</option>
                  <option value="1.20">1.20</option>
                  <option value="1.19.2">1.19.2</option>
                  <option value="1.18">1.18</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!searchQuery.trim() || loading}
                style={{ width: '100%' }}
              >
                {loading ? '🔄 Buscando...' : '🔍 Buscar'}
              </button>
            </form>

            {modpacks.length > 0 && (
              <div className="modpack-list">
                {modpacks.map((modpack) => (
                  <button
                    key={modpack.id}
                    className="modpack-card"
                    onClick={() => handleSelectModpack(modpack)}
                    disabled={loading}
                  >
                    {modpack.logo && (
                      <img
                        src={modpack.logo.url}
                        alt={modpack.name}
                        className="modpack-card-logo"
                      />
                    )}
                    <div className="modpack-card-content">
                      <div className="modpack-card-name">{modpack.name}</div>
                      <div className="modpack-card-summary">{modpack.summary}</div>
                      <div className="modpack-card-meta">
                        ⬇️ {formatNumber(modpack.downloadCount || 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {modpacks.length === 0 && !loading && searchQuery && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                <p>No se encontraron resultados</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>
                  Intenta con otro término de búsqueda
                </p>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p>🔄 Buscando modpacks...</p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
