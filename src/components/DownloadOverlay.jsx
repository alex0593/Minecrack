import { useState, useEffect, useCallback, useRef } from 'react';
import './DownloadOverlay.css';
import { useStore } from '../store';
import { getLauncherDir, tauriListen } from '../lib/tauri';
import { installVersion, installAssets } from '../lib/downloader';
import { formatSpeed, formatETA, formatBytes } from '../lib/format';

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
  const [actualVersion, setActualVersion] = useState(versionId);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [expandedErrorId, setExpandedErrorId] = useState(null);
  const [speed, setSpeed] = useState(0);          // bytes/sec
  const [eta,   setEta]   = useState(null);       // sec restantes

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  // Muestras para calcular velocidad/ETA (últimos 5 segundos)
  const samplesRef = useRef([]);  // [{ t: ms, bytes: total acumulado aproximado }]
  const accumBytesRef = useRef(0);

  const handleProgress = useCallback(({ done: d, total: t, label, phase: ph, percent: pct }) => {
    if (d !== undefined) setDone(d);
    if (t !== undefined) setTotal(t);
    if (label)           setCurrentFile(label);
    if (ph)              setPhase(ph);
  }, []);

  const handleError = useCallback(({ task, error }) => {
    setErrors(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      label: task.label,
      message: String(error),
    }]);
  }, []);

  function dismissError(id) {
    setErrors(prev => prev.filter(e => e.id !== id));
  }

  useEffect(() => {
    let unlistenProgress;
    let cancelled = false;

    // Escuchar progreso de bytes individuales (eventos Rust)
    tauriListen('download://progress', (payload) => {
      setByteProgress({ received: payload.received, total: payload.total });
      setCurrentFile(payload.file);

      // Sample para velocidad/ETA: usar bytes recibidos en este archivo
      // Acumulamos delta entre muestras
      const now = Date.now();
      const samples = samplesRef.current;
      const lastSample = samples[samples.length - 1];

      // Si recibimos un nuevo archivo (received bajó), reset acumulado pero mantenemos histórico
      if (lastSample && payload.received < (lastSample.fileBytes ?? 0)) {
        accumBytesRef.current += (lastSample.fileBytes ?? 0);
      }

      const totalAccum = accumBytesRef.current + payload.received;
      samples.push({ t: now, bytes: totalAccum, fileBytes: payload.received });

      // Mantener solo muestras de últimos 5s
      while (samples.length > 0 && now - samples[0].t > 5000) {
        samples.shift();
      }

      // Calcular velocidad: delta bytes / delta tiempo
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = (last.t - first.t) / 1000;
        const db = last.bytes - first.bytes;
        if (dt > 0.5 && db > 0) {
          const bps = db / dt;
          setSpeed(bps);

          // ETA: bytes restantes en archivo actual / velocidad
          if (payload.total > 0) {
            const remaining = payload.total - payload.received;
            setEta(remaining / bps);
          }
        }
      }
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
          setErrors(prev => [...prev, {
            id: `version-${Date.now()}`,
            label: 'Versión cambiada',
            message: `Loader no disponible para MC ${versionId}, usando ${actualGameVersion}`,
          }]);
        }

        // Fase 2: assets (sonidos, texturas)
        setPhase('assets');
        await installAssets(assetIndexInfo, launcherDir, handleProgress, handleError);
        if (cancelled) return;

        setPhase('done');
        setFinished(true);
        setTimeout(() => onDone?.(launcherDir, versionData, loaderVersion), 1000);

      } catch (err) {
        setErrors(prev => [...prev, {
          id: `fatal-${Date.now()}`,
          label: 'Error fatal',
          message: err.message,
        }]);
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
            {finished ? '🎮 Lanzando juego — abriendo Minecraft' : currentFile || 'Iniciando...'}
          </div>

          {/* Velocidad y ETA durante descarga activa */}
          {!finished && speed > 0 && (
            <div className="download-stats">
              <span><strong>{formatSpeed(speed)}</strong></span>
              {eta != null && <span>ETA: <strong>{formatETA(eta)}</strong></span>}
              {byteProgress?.total > 0 && (
                <span>
                  {formatBytes(byteProgress.received)} / {formatBytes(byteProgress.total)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Errores como cards individuales */}
        {errors.length > 0 && (
          <div className="dl-errors">
            {errors.length > 3 && !showAllErrors ? (
              <>
                {errors.slice(-2).map(e => (
                  <ErrorCard
                    key={e.id}
                    error={e}
                    expanded={expandedErrorId === e.id}
                    onToggle={() => setExpandedErrorId(p => p === e.id ? null : e.id)}
                    onDismiss={() => dismissError(e.id)}
                  />
                ))}
                <button
                  className="errors-group-toggle"
                  onClick={() => setShowAllErrors(true)}
                >
                  ⬇ Ver {errors.length - 2} errores más
                </button>
              </>
            ) : (
              errors.map(e => (
                <ErrorCard
                  key={e.id}
                  error={e}
                  expanded={expandedErrorId === e.id}
                  onToggle={() => setExpandedErrorId(p => p === e.id ? null : e.id)}
                  onDismiss={() => dismissError(e.id)}
                />
              ))
            )}
            {errors.length > 3 && showAllErrors && (
              <button
                className="errors-group-toggle"
                onClick={() => setShowAllErrors(false)}
              >
                ⬆ Colapsar errores
              </button>
            )}
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

/**
 * ErrorCard — card individual con dismiss y expand del mensaje
 */
function ErrorCard({ error, expanded, onToggle, onDismiss }) {
  const isLong = error.message.length > 80;

  return (
    <div className="error-card">
      <span className="error-card-icon" aria-hidden="true">⚠</span>
      <div className="error-card-body">
        <div className="error-card-label">{error.label}</div>
        <div className={`error-card-msg${isLong && !expanded ? ' is-collapsed' : ''}`}>
          {error.message}
        </div>
        {isLong && (
          <button className="error-card-expand" onClick={onToggle}>
            {expanded ? 'Ocultar' : 'Ver más'}
          </button>
        )}
      </div>
      <button
        className="error-card-dismiss"
        onClick={onDismiss}
        aria-label="Descartar error"
        title="Descartar"
      >✕</button>
    </div>
  );
}
