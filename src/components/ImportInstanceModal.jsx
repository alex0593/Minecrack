import { useState, useEffect, useCallback, useRef } from 'react';
import { pickFile, pickFolder, inspectInstanceZip, inspectInstanceFolder,
         importInstanceFromZip, importInstanceFromFolder, getLauncherDir,
         getModsToDownload, tauriListen } from '../lib/tauri';
import { installVersion, installAssets } from '../lib/downloader';
import { useStore } from '../store';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import './ImportInstanceModal.css';

// ─── Paso visual durante el proceso ──────────────────────────────────────────
function StepIndicator({ steps, current }) {
  return (
    <div className="import-steps">
      {steps.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={s.id} className={`import-step${done ? ' done' : active ? ' active' : ''}`}>
            <div className="import-step-dot">
              {done ? '✓' : <span>{i + 1}</span>}
            </div>
            <span className="import-step-label">{s.label}</span>
            {i < steps.length - 1 && <div className="import-step-line" />}
          </div>
        );
      })}
    </div>
  );
}

const STEPS = [
  { id: 'setup',    label: 'Preparar' },
  { id: 'mc',      label: 'Minecraft' },
  { id: 'mods',    label: 'Mods' },
];

// ─── Barra de progreso con label ─────────────────────────────────────────────
function ProgressRow({ label, sub, value }) {
  return (
    <div className="import-progress-row">
      <div className="import-progress-labels">
        <span className="import-progress-label">{label}</span>
        {sub && <span className="import-progress-sub">{sub}</span>}
      </div>
      <div className="import-progress-bar">
        <div className="import-progress-fill" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
      </div>
      <span className="import-progress-pct">{Math.round(value ?? 0)}%</span>
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ImportInstanceModal({ onClose }) {
  const { dispatch } = useStore();

  // Estado de la máquina
  const [phase, setPhase] = useState('idle');
  // idle | selecting | inspecting | preview | creating | installing-mc | downloading-mods | done | error

  const [sourceType, setSourceType]     = useState(null);
  const [sourcePath, setSourcePath]     = useState(null);
  const [preview, setPreview]           = useState(null);
  const [newName, setNewName]           = useState('');
  const [error, setError]               = useState(null);

  // Progreso
  const [stepIdx, setStepIdx]           = useState(0);
  const [progressPct, setProgressPct]   = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressSub, setProgressSub]   = useState('');

  // Resultados
  const [instanceId, setInstanceId]     = useState(null);
  const [launcherDir, setLauncherDir]   = useState(null);
  const [modsTotal, setModsTotal]       = useState(0);
  const [modsDone, setModsDone]         = useState(0);
  const [modsFailed, setModsFailed]     = useState(0);

  const cancelRef = useRef(false);

  // ── Selección ──────────────────────────────────────────────────────────────
  const selectFile = async (type) => {
    try {
      setPhase('inspecting');
      const path = type === 'zip'
        ? await pickFile({ title: 'Seleccionar ZIP de modpack (CurseForge)', filters: [{ name: 'ZIP', extensions: ['zip'] }] })
        : await pickFolder({ title: 'Seleccionar carpeta de instancia' });

      if (!path) { setPhase('idle'); return; }

      setSourcePath(path);
      setSourceType(type);

      const info = type === 'zip' ? await inspectInstanceZip(path) : await inspectInstanceFolder(path);
      setPreview(info);
      setNewName(info.name ? `${info.name}` : 'Nueva instancia');
      setPhase('preview');
    } catch (err) {
      setError(err?.message || String(err));
      setPhase('error');
    }
  };

  // ── Importar ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    cancelRef.current = false;
    const dir = await getLauncherDir();
    setLauncherDir(dir);

    try {
      // ── Paso 0: Crear instancia en disco ────────────────────────────────
      setPhase('creating');
      setStepIdx(0);
      setProgressPct(10);
      setProgressLabel('Creando instancia...');

      const result = sourceType === 'zip'
        ? await importInstanceFromZip(dir, sourcePath, newName)
        : await importInstanceFromFolder(dir, sourcePath, newName);

      const newId = result.newInstanceId;
      setInstanceId(newId);

      // Agregar al store (sin instalar todavía)
      dispatch({
        type: 'ADD_INSTANCE',
        payload: {
          id: newId,
          name: newName,
          version: preview?.version || '1.20.1',
          loader: preview?.loader || 'vanilla',
          loaderVersion: result.loaderVersion || preview?.loaderVersion || null,
          icon: '📦',
          ram: 2048,
          jvmArgs: '',
          installed: false,
          lastPlayed: null,
          modsCount: preview?.modsCount || 0,
        },
      });

      // ── Paso 1: Instalar Minecraft + loader ─────────────────────────────
      setPhase('installing-mc');
      setStepIdx(1);
      setProgressPct(0);
      setProgressLabel('Instalando Minecraft...');

      const instance = {
        id: newId,
        loader: preview?.loader || 'vanilla',
        loaderVersion: result.loaderVersion || preview?.loaderVersion || null,
      };

      // Progreso de archivos
      const handleMCProgress = ({ done: d, total: t, label, phase: ph }) => {
        if (t > 0) setProgressPct(Math.round((d / t) * 80));
        if (label) setProgressLabel(label);
        if (ph === 'assets') setProgressSub('Descargando sonidos y texturas...');
        else if (ph === 'libraries') setProgressSub('Descargando librerías...');
        else if (ph === 'loader') setProgressSub('Instalando loader...');
        else setProgressSub('');
      };

      // Escuchar eventos de bytes para velocidad visual
      let unlisten;
      tauriListen('download://progress', (payload) => {
        if (payload.total > 0) {
          setProgressSub(`${payload.file} — ${Math.round((payload.received / payload.total) * 100)}%`);
        }
      }).then(fn => { unlisten = fn; });

      const { versionData, assetIndexInfo, loaderVersion: installedLoaderVer } =
        await installVersion(preview?.version || '1.20.1', dir, instance, handleMCProgress, () => {});

      setProgressPct(85);
      setProgressLabel('Descargando assets (sonidos, texturas)...');
      setProgressSub('');

      await installAssets(assetIndexInfo, dir, handleMCProgress, () => {});
      unlisten?.();

      // Marcar como instalada
      dispatch({
        type: 'UPDATE_INSTANCE',
        payload: {
          id: newId,
          installed: true,
          loaderVersion: installedLoaderVer || result.loaderVersion,
        },
      });

      // ── Paso 2: Descargar mods ──────────────────────────────────────────
      const instanceFolder = `${dir}/instances/${newId}`;
      const mods = await getModsToDownload(instanceFolder).catch(() => []);

      if (!mods || mods.length === 0) {
        setPhase('done');
        return;
      }

      setPhase('downloading-mods');
      setStepIdx(2);
      setProgressPct(0);
      setProgressLabel(`Descargando ${mods.length} mods...`);
      setModsTotal(mods.length);
      setModsDone(0);
      setModsFailed(0);

      await downloadMultipleModsFromCurseForge(dir, newId, mods, (info) => {
        if (info.status === 'progress') {
          setModsDone(info.downloaded || 0);
          setModsFailed(info.failed || 0);
          setProgressPct(info.percent ?? 0);
          setProgressLabel(info.label || '');
        }
      });

      setPhase('done');

    } catch (err) {
      setError(err?.message || String(err));
      setPhase('error');
    }
  };

  // ── Auto-cierre al terminar ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'done') {
      const t = setTimeout(onClose, 2500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  // Error
  if (phase === 'error') {
    return (
      <div className="import-overlay" onClick={onClose}>
        <div className="import-modal" onClick={e => e.stopPropagation()}>
          <div className="import-error-header">
            <span style={{ fontSize: 28 }}>❌</span>
            <h2>Error al importar</h2>
          </div>
          <pre className="import-error-msg">{error}</pre>
          <div className="import-footer">
            <button className="btn btn-ghost" onClick={() => { setError(null); setPhase('idle'); }}>
              Volver a intentar
            </button>
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  // En proceso (creating / installing-mc / downloading-mods / done)
  if (['creating', 'installing-mc', 'downloading-mods', 'done'].includes(phase)) {
    const isDone = phase === 'done';
    return (
      <div className="import-overlay">
        <div className="import-modal import-modal-progress" onClick={e => e.stopPropagation()}>

          {/* Título */}
          <div className="import-progress-header">
            {isDone
              ? <><span className="import-done-icon">✅</span><h2>¡Importación completa!</h2></>
              : <><div className="import-spinner" /><h2>Importando {newName}</h2></>
            }
          </div>

          {/* Indicador de pasos */}
          <StepIndicator steps={STEPS} current={stepIdx} />

          {/* Barra de progreso */}
          {!isDone && (
            <ProgressRow
              label={progressLabel || 'Procesando...'}
              sub={progressSub}
              value={progressPct}
            />
          )}

          {/* Resumen de mods si estamos en esa fase */}
          {(phase === 'downloading-mods' || isDone) && modsTotal > 0 && (
            <div className="import-mods-summary">
              <span>Mods: <strong>{modsDone}/{modsTotal}</strong></span>
              {modsFailed > 0 && <span className="import-mods-failed">{modsFailed} fallidos</span>}
            </div>
          )}

          {isDone && (
            <div className="import-done-info">
              <span>{preview?.version} · {preview?.loader}</span>
              {modsTotal > 0 && <span>{modsDone} mods instalados</span>}
            </div>
          )}

        </div>
      </div>
    );
  }

  // Preview (confirmación)
  if (phase === 'preview' && preview) {
    const loaderColor = {
      forge: 'var(--amber)', fabric: 'var(--blue)',
      quilt: 'var(--purple)', neoforge: 'var(--red)',
    }[preview.loader] || 'var(--text-secondary)';

    return (
      <div className="import-overlay" onClick={onClose}>
        <div className="import-modal" onClick={e => e.stopPropagation()}>

          <div className="import-header">
            <div className="import-header-icon">📦</div>
            <div>
              <h2 className="import-title">Importar modpack</h2>
              <p className="import-subtitle">Revisa la información antes de importar</p>
            </div>
            <button className="import-close" onClick={onClose}>✕</button>
          </div>

          {/* Info del pack */}
          <div className="import-pack-info">
            <div className="import-pack-name">{preview.name || 'Modpack'}</div>
            <div className="import-pack-tags">
              <span className="import-tag">{preview.version || '?'}</span>
              <span className="import-tag" style={{ color: loaderColor, borderColor: loaderColor }}>
                {preview.loader || 'vanilla'}
              </span>
              {preview.modsCount > 0 && (
                <span className="import-tag">{preview.modsCount} mods</span>
              )}
            </div>
          </div>

          {/* Pasos que se ejecutarán */}
          <div className="import-plan">
            <div className="import-plan-title">Lo que se instalará:</div>
            <div className="import-plan-steps">
              <div className="import-plan-step">
                <span>⬇</span> Minecraft {preview.version}
              </div>
              {preview.loader && preview.loader !== 'vanilla' && (
                <div className="import-plan-step">
                  <span>⬇</span> {preview.loader} {preview.loaderVersion ? `(${preview.loaderVersion})` : ''}
                </div>
              )}
              {preview.modsCount > 0 && (
                <div className="import-plan-step">
                  <span>⬇</span> {preview.modsCount} mods desde CurseForge
                </div>
              )}
              {preview.hasOverrides && (
                <div className="import-plan-step">
                  <span>📂</span> Configuración y overrides
                </div>
              )}
            </div>
          </div>

          {/* Nombre */}
          <div className="import-field">
            <label className="import-field-label">Nombre de la instancia</label>
            <input
              className="input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre..."
              autoFocus
            />
          </div>

          <div className="import-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!newName.trim()}
            >
              📥 Importar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inspecting (loading)
  if (phase === 'inspecting') {
    return (
      <div className="import-overlay">
        <div className="import-modal import-modal-sm" onClick={e => e.stopPropagation()}>
          <div className="import-loading">
            <div className="import-spinner" />
            <span>Leyendo archivo...</span>
          </div>
        </div>
      </div>
    );
  }

  // Selección de origen
  if (phase === 'selecting') {
    return (
      <div className="import-overlay" onClick={onClose}>
        <div className="import-modal import-modal-sm" onClick={e => e.stopPropagation()}>
          <div className="import-header">
            <div className="import-header-icon">📥</div>
            <div>
              <h2 className="import-title">¿De dónde importar?</h2>
              <p className="import-subtitle">Selecciona el origen del modpack</p>
            </div>
            <button className="import-close" onClick={onClose}>✕</button>
          </div>

          <div className="import-sources">
            <button className="import-source-card" onClick={() => selectFile('zip')}>
              <span className="import-source-icon">📦</span>
              <div>
                <div className="import-source-title">Archivo ZIP</div>
                <div className="import-source-desc">Modpack de CurseForge (.zip)</div>
              </div>
              <span className="import-source-arrow">→</span>
            </button>
            <button className="import-source-card" onClick={() => selectFile('folder')}>
              <span className="import-source-icon">📁</span>
              <div>
                <div className="import-source-title">Carpeta</div>
                <div className="import-source-desc">Instancia existente en carpeta</div>
              </div>
              <span className="import-source-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Estado idle (pantalla inicial)
  return (
    <div className="import-overlay" onClick={onClose}>
      <div className="import-modal import-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="import-header">
          <div className="import-header-icon">📥</div>
          <div>
            <h2 className="import-title">Importar instancia</h2>
            <p className="import-subtitle">Importa un modpack de CurseForge o una instancia existente</p>
          </div>
          <button className="import-close" onClick={onClose}>✕</button>
        </div>

        <div className="import-idle-features">
          <div className="import-feature"><span>✓</span> Instala Minecraft y el modloader automáticamente</div>
          <div className="import-feature"><span>✓</span> Descarga todos los mods desde CurseForge</div>
          <div className="import-feature"><span>✓</span> Copia configuración y saves del pack</div>
        </div>

        <div className="import-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => setPhase('selecting')}>
            📥 Importar
          </button>
        </div>
      </div>
    </div>
  );
}
