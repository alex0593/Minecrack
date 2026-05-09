import { useState, useEffect, useCallback } from 'react';
import './DownloadOverlay.css';
import { useStore } from '../store';
import { getLauncherDir, tauriListen } from '../lib/tauri';
import { installVersion, installAssets } from '../lib/downloader';

const PHASE_LABELS = {
  init:        { label: 'Preparando...',              cls: 'dl-phase-init'      },
  libraries:   { label: 'Descargando juego',         cls: 'dl-phase-libraries' },
  loader:      { label: 'Preparando loader...',      cls: 'dl-phase-loader'    },
  'loader-libs': { label: 'Descargando loader',      cls: 'dl-phase-loader'    },
  assets:      { label: 'Descargando assets',        cls: 'dl-phase-assets'    },
  done:        { label: '¡Listo!',                   cls: 'dl-phase-done'      },
};

/**
 * DownloadOverlay — Muestra progreso de instalación de una versión de MC
 *
 * Props:
 *   versionId    — "1.21.1"
 *   instanceName — nombre para mostrar
 *   onDone(launcherDir, versionData) — callback al terminar
 *   onError(err) — callback si hay error fatal
 */
export default function DownloadOverlay({ versionId, instanceName, onDone, onCancel, instanceId }) {
  const { state } = useStore();
  const instance = state.instances?.find(i => i.id === instanceId);

  const [phase,       setPhase]       = useState('init');
  const [done,        setDone]        = useState(0);
  const [total,       setTotal]       = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [errors,      setErrors]      = useState([]);
  const [finished,    setFinished]    = useState(false);
  const [byteProgress, setByteProgress] = useState(null); // { received, total }
  const [actualVersion, setActualVersion] = useState(versionId); // Versión real instalada

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleProgress = useCallback(({ done: d, total: t, label, phase: ph, percent: pct }) => {
    if (d !== undefined) setDone(d);
    if (t !== undefined) setTotal(t);
    if (label)           setCurrentFile(label);
    if (ph)              setPhase(ph);
  }, []);

  const handleError = useCallback(({ task, error }) => {
    setErrors(prev => [...prev.slice(-4), `${task.label}: ${error}`]);
  }, []);

  useEffect(() => {
    let unlistenProgress;
    let cancelled = false;

    // Escuchar progreso de bytes individuales (eventos Rust)
    tauriListen('download://progress', (payload) => {
      setByteProgress({ received: payload.received, total: payload.total });
      setCurrentFile(payload.file);
    }).then(fn => { unlistenProgress = fn; });

    async function run() {
      try {
        const launcherDir = await getLauncherDir();

        // Fase 1: client.jar + libraries + loader
        setPhase('libraries');
        const { versionData, assetIndexInfo, actualGameVersion, loaderVersion } = await installVersion(
          versionId, launcherDir, instance, handleProgress, handleError
        );
        if (cancelled) return;
        if (actualGameVersion && actualGameVersion !== versionId) {
          setActualVersion(actualGameVersion);
          setErrors(prev => [...prev, `⚠ Loader no disponible para MC ${versionId}, usando ${actualGameVersion}`]);
        }

        // Fase 2: assets (sonidos, texturas)
        setPhase('assets');
        await installAssets(assetIndexInfo, launcherDir, handleProgress, handleError);
        if (cancelled) return;

        setPhase('done');
        setFinished(true);
        setTimeout(() => onDone?.(launcherDir, versionData, loaderVersion), 1000);

      } catch (err) {
        setErrors(prev => [...prev, `Error fatal: ${err.message}`]);
      }
    }

    run();

    return () => {
      cancelled = true;
      unlistenProgress?.();
    };
  }, [versionId]);

  const phaseInfo = PHASE_LABELS[phase] ?? PHASE_LABELS.init;

  return (
    <div className="dl-overlay">
      <div className="dl-modal">

        {/* Header */}
        <div className="dl-header">
          <div className="dl-icon">
            {finished ? '✅' : phase === 'assets' ? '🎵' : '📦'}
          </div>
          <div>
            <div className="dl-title">
              {finished ? '¡Instalación completa!' : `Instalando ${instanceName}`}
            </div>
            <div className="dl-subtitle">
              Minecraft {actualVersion}
              {actualVersion !== versionId && <span style={{ marginLeft: 8, opacity: 0.6 }}>({versionId} → {actualVersion})</span>}
            </div>
          </div>
        </div>

        {/* Phase badge */}
        <div className={`dl-phase ${phaseInfo.cls}`}>
          {finished ? '✓' : <span className="spinner" style={{ width: 10, height: 10 }} />}
          {phaseInfo.label}
        </div>

        {/* Progress bar */}
        <div className="dl-progress-wrap">
          <div className="dl-stats">
            <span>
              <span className="dl-stats-count">{done}</span> / {total} archivos
            </span>
            <span className="dl-stats-count">{percent}%</span>
          </div>

          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${finished ? 100 : percent}%` }}
            />
          </div>

          {/* Progreso de bytes del archivo actual */}
          {byteProgress && byteProgress.total > 0 && !finished && (
            <div style={{ marginTop: 6 }}>
              <div className="progress-bar" style={{ height: 2 }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${(byteProgress.received / byteProgress.total) * 100}%`,
                    background: 'var(--blue)',
                  }}
                />
              </div>
            </div>
          )}

          <div className="dl-current-file">
            {finished ? '¡Todo listo! Iniciando...' : currentFile || 'Iniciando...'}
          </div>
        </div>

        {/* Errores */}
        {errors.length > 0 && (
          <div className="dl-errors">
            {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
          </div>
        )}

        {/* Botón cancelar (solo si no terminó) */}
        {!finished && (
          <button
            id="btn-cancel-download"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 14 }}
            onClick={onCancel}
          >
            Cancelar instalación
          </button>
        )}

      </div>
    </div>
  );
}
