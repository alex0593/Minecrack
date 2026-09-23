import { useState, useEffect } from 'react';
import { useStoreState, useDispatch } from '../../store';
import { getProjectVersions, getProject, createModrinthFetcher } from '../../lib/api/modrinth';
import { normalizeModrinthVersion } from '../../lib/mods/metadata';
import { resolveInstallPlan } from '../../lib/mods/resolver';
import { validateModCompatibility } from '../../lib/mods/validator';
import { downloadMod, getLauncherDir, listMods, tauriListen } from '../../lib/tauri';
import Select from '../ui/Select';
import InstallConfirmModal from '../InstallConfirmModal';
import './ModDetail.css';

/** Panel de detalle + instalación de un mod (versiones, validación y plan). */
export default function ModDetail({ mod, instance, onInstalled, isModpack, filterSource }) {
  const [versions,      setVersions]      = useState([]);
  const [selectedVer,   setSelectedVer]   = useState(null);
  const [normalizedMod, setNormalizedMod] = useState(null);
  const [validation,    setValidation]    = useState(null);  // { compatible, errors, warnings }
  const [resolving,     setResolving]     = useState(false);
  const [plan,          setPlan]          = useState(null);  // ResolutionPlan
  const [installing,    setInstalling]    = useState(false);
  const [progress,      setProgress]      = useState(null);
  const { dispatch }    = useDispatch();
  const state           = useStoreState();

  // Mods ya instalados en la instancia actual
  const installedIds = (state.instanceMods ?? []).map(m => m.id ?? m.filename);

  // ── Cargar versiones del proyecto ─────────────────────────────────────────
  useEffect(() => {
    if (!mod || !instance) return;
    setVersions([]);
    setSelectedVer(null);
    setNormalizedMod(null);
    setValidation(null);
    setPlan(null);

    getProjectVersions(mod.project_id, {
      gameVersion: instance.version,
      loader: instance.loader === 'vanilla' ? undefined : instance.loader,
    }).then(vers => {
      setVersions(vers);
      if (vers.length > 0) setSelectedVer(vers[0]);
    }).catch(() => setVersions([]));
  }, [mod?.project_id, instance?.id]);

  // ── Normalizar versión seleccionada y validar compatibilidad ──────────────
  useEffect(() => {
    if (!selectedVer) return;
    setNormalizedMod(null);
    setValidation(null);
    setPlan(null);

    let project = null;
    // Enriquecer con datos del proyecto (icono, autor) de forma asíncrona
    getProject(mod.project_id)
      .then(p => { project = p; })
      .catch(() => {})
      .finally(() => {
        const normalized = normalizeModrinthVersion(selectedVer, project ?? { title: mod.title, icon_url: mod.icon_url });
        setNormalizedMod(normalized);
        const result = validateModCompatibility(normalized, {
          version:     instance.version,
          loader:      instance.loader,
          javaVersion: null,
        });
        setValidation(result);
      });
  }, [selectedVer?.id]);

  // ── Preparar plan de instalación ──────────────────────────────────────────
  const handlePrepareInstall = async () => {
    if (!normalizedMod) return;
    setResolving(true);
    setPlan(null);

    try {
      const fetcher = createModrinthFetcher();
      const resolved = await resolveInstallPlan(
        normalizedMod,
        { version: instance.version, loader: instance.loader },
        installedIds,
        fetcher
      );
      setPlan(resolved);
    } catch (err) {
      console.error('[ModDetail] Error resolviendo dependencias:', err);
      // Fallback: plan mínimo solo con el mod principal
      setPlan({
        toInstall:  [{ mod: normalizedMod, isDep: false, depth: 0 }],
        toSkip:     [],
        unresolved: [{ projectId: 'deps', reason: `No se pudieron resolver dependencias: ${err.message}` }],
        conflicts:  [],
        warnings:   [],
      });
    } finally {
      setResolving(false);
    }
  };

  // ── Ejecutar instalación tras confirmar ───────────────────────────────────
  const handleConfirmInstall = async (toInstall) => {
    setPlan(null);
    setInstalling(true);
    setProgress({ label: 'Preparando...', percent: 0 });

    const unlisten = await tauriListen('download://progress', (payload) => {
      if (payload.total > 0) {
        setProgress({
          label: payload.file,
          percent: Math.round((payload.received / payload.total) * 100),
        });
      }
    });

    try {
      const launcherDir = await getLauncherDir();

      for (const entry of toInstall) {
        const { mod: m, isDep } = entry;
        setProgress({ label: `${isDep ? '[Dep] ' : ''}${m.fileName}`, percent: 0 });
        await downloadMod(
          launcherDir,
          instance.id,
          m.downloadUrl,
          m.fileName,
          m.sha1 ?? null
        );
      }

      const mods = await listMods(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });

      setProgress({ label: '¡Instalado!', percent: 100 });
      setTimeout(() => {
        setProgress(null);
        setInstalling(false);
        onInstalled?.();
      }, 1200);

    } catch (err) {
      setProgress({ label: `Error: ${err.message}`, percent: 0, error: true });
      setTimeout(() => { setProgress(null); setInstalling(false); }, 3000);
    } finally {
      unlisten?.();
    }
  };

  if (!mod) return (
    <div className="modbrowser-detail-empty">
      <div style={{ fontSize: 48 }}>🧩</div>
      <p>Selecciona un mod para ver los detalles</p>
    </div>
  );

  const mainFile = selectedVer?.files?.find(f => f.primary) ?? selectedVer?.files?.[0];
  const sizeMB   = mainFile ? (mainFile.size / 1_048_576).toFixed(2) : null;
  const canInstall = selectedVer && versions.length > 0 && normalizedMod && !installing && !resolving;

  return (
    <div className="modbrowser-detail">
      {/* Modal de confirmación (se muestra encima) */}
      {plan && (
        <InstallConfirmModal
          plan={plan}
          onConfirm={handleConfirmInstall}
          onCancel={() => setPlan(null)}
        />
      )}

      <div className="modbrowser-detail-header">
        {mod.icon_url && (
          <img src={mod.icon_url} alt={mod.title} className="modbrowser-detail-icon" />
        )}
        <div>
          <h2>{mod.title}</h2>
          <div className="modbrowser-detail-by">por {mod.author}</div>
          <div className="modbrowser-detail-stats">
            <span>⬇ {mod.downloads?.toLocaleString()} descargas</span>
            <span>👥 {mod.follows?.toLocaleString()} seguidores</span>
          </div>
        </div>
      </div>

      <p className="modbrowser-detail-desc">{mod.description}</p>

      {/* Selector de versión */}
      <div className="modbrowser-detail-section">
        <label>Versión</label>
        {versions.length === 0 ? (
          <div className="modbrowser-no-versions">
            No hay versiones compatibles con MC {instance.version} + {instance.loader}
          </div>
        ) : (
          <Select
            size="sm"
            value={selectedVer?.id ?? ''}
            onChange={(id) => setSelectedVer(versions.find(v => v.id === id))}
            options={versions.map(v => ({
              value: v.id,
              label: `${v.name} — ${v.version_number}`,
            }))}
          />
        )}
      </div>

      {/* Info del archivo */}
      {mainFile && (
        <div className="modbrowser-detail-file">
          <span>📄 {mainFile.filename}</span>
          {sizeMB && <span>{sizeMB} MB</span>}
        </div>
      )}

      {/* Indicadores de compatibilidad */}
      {validation && (
        <div className="modbrowser-compat">
          {validation.compatible
            ? <span className="modbrowser-compat-ok">✓ Compatible con MC {instance.version} · {instance.loader}</span>
            : validation.errors.map((e, i) => (
                <div key={i} className="modbrowser-compat-error">✕ {e}</div>
              ))
          }
          {validation.warnings.map((w, i) => (
            <div key={i} className="modbrowser-compat-warn">⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Progreso / Botón instalar */}
      {progress ? (
        <div className="modbrowser-progress">
          <div className="modbrowser-progress-bar">
            <div
              className="modbrowser-progress-fill"
              style={{
                width: `${progress.percent}%`,
                background: progress.error ? 'var(--red)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="modbrowser-progress-label">{progress.label}</div>
        </div>
      ) : (
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 16 }}
          disabled={!canInstall}
          onClick={handlePrepareInstall}
        >
          {resolving
            ? '⏳ Analizando dependencias...'
            : installing
              ? '⏳ Instalando...'
              : '⬇ Ver detalles e instalar'
          }
        </button>
      )}
    </div>
  );
}
