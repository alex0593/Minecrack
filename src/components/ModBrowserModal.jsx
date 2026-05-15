import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store';
import { searchMods, searchModpacks, getProjectVersions, getProject, getVersion, createModrinthFetcher } from '../lib/api/modrinth';
import { searchMods as searchModsCF, searchModpacks as searchModpacksCF, isCurseForgeConfigured } from '../lib/api/curseforge';
import { normalizeModrinthVersion } from '../lib/mods/metadata';
import { resolveInstallPlan } from '../lib/mods/resolver';
import { validateModCompatibility } from '../lib/mods/validator';
import { downloadMod, getLauncherDir, listMods, tauriListen, importInstanceFromZip, getModsToDownload } from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import { LOADERS } from '../lib/instances';
import Select from './ui/Select';
import InstallConfirmModal from './InstallConfirmModal';
import './ModBrowserModal.css';

const LOADERS_MODRINTH = ['fabric', 'forge', 'quilt', 'neoforge'];

// ─── Tarjeta de mod en el grid ────────────────────────────────────────────────
function ModCard({ mod, selected, onClick, isInstalled }) {
  return (
    <button
      className={`modbrowser-card${selected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <img
        className="modbrowser-card-icon"
        src={mod.icon_url || '/default-mod.png'}
        alt={mod.title}
        onError={e => { e.target.style.display = 'none'; }}
      />
      <div className="modbrowser-card-info">
        <div className="modbrowser-card-title">
          {mod.title}
          {isInstalled && (
            <span className="modbrowser-installed-badge">✓ Instalado</span>
          )}
        </div>
        <div className="modbrowser-card-desc">{mod.description}</div>
        <div className="modbrowser-card-meta">
          <span>⬇ {(mod.downloads / 1000).toFixed(0)}k</span>
          <span>🔄 {new Date(mod.date_modified).toLocaleDateString()}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Panel de detalle + instalación ──────────────────────────────────────────
function ModDetail({ mod, instance, onInstalled, isModpack, filterSource }) {
  const [versions,      setVersions]      = useState([]);
  const [selectedVer,   setSelectedVer]   = useState(null);
  const [normalizedMod, setNormalizedMod] = useState(null);
  const [validation,    setValidation]    = useState(null);  // { compatible, errors, warnings }
  const [resolving,     setResolving]     = useState(false);
  const [plan,          setPlan]          = useState(null);  // ResolutionPlan
  const [installing,    setInstalling]    = useState(false);
  const [progress,      setProgress]      = useState(null);
  const { dispatch, state }               = useStore();

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

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ModBrowserModal({ instanceId, onClose }) {
  const { state } = useStore();
  const instance  = state.instances.find(i => i.id === instanceId);

  // Guard: Vanilla no soporta mods
  if (instance?.loader === 'vanilla') {
    return (
      <div className="modbrowser-overlay" onClick={onClose}>
        <div className="modbrowser-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, minHeight: 'auto' }}>
          <div className="modbrowser-header">
            <h2>📦 Explorar Mods</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div style={{ textAlign: 'center', padding: '48px 32px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Vanilla no soporta mods</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Para instalar mods necesitas cambiar el loader de la instancia a
              <strong> Fabric</strong>, <strong>Forge</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong>.
            </p>
          </div>
          <div className="modal-footer" style={{ justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  // IDs de mods ya instalados para mostrar badge "Instalado"
  const installedIds = (state.instanceMods ?? []).map(m => m.id ?? m.slug ?? m.filename);

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterSource, setFilterSource] = useState('modrinth');
  const [filterType, setFilterType] = useState('mods'); // 'mods' | 'modpacks'

  const [filterVersion, setFilterVersion] = useState(instance?.version ?? '');
  const [filterLoader,  setFilterLoader]  = useState(
    instance?.loader && instance.loader !== 'vanilla' ? instance.loader : ''
  );

  const debounceRef = useRef(null);
  const LIMIT = 20;

  const doSearch = useCallback(async (q, version, loader, source, type, off = 0) => {
    setLoading(true);
    try {
      let data;
      if (source === 'modrinth') {
        if (type === 'mods') {
          data = await searchMods({
            query: q,
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        } else {
          data = await searchModpacks({
            query: q,
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        }
        if (off === 0) setResults(data.hits);
        else setResults(prev => [...prev, ...data.hits]);
        setTotal(data.total_hits);
      } else if (source === 'curseforge') {
        if (type === 'mods') {
          data = await searchModsCF(q, {
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        } else {
          data = await searchModpacksCF(q, {
            gameVersion: version || undefined,
            limit: LIMIT,
            offset: off,
          });
        }
        if (off === 0) setResults(data.data);
        else setResults(prev => [...prev, ...data.data]);
        setTotal(data.pagination.totalCount);
      }
      setOffset(off);
    } catch (err) {
      console.error('[ModBrowser] Error buscando:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Búsqueda inicial
  useEffect(() => { doSearch(query, filterVersion, filterLoader, filterSource, filterType, 0); }, []);

  // Debounce en query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, filterVersion, filterLoader, filterSource, filterType, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, filterVersion, filterLoader, filterSource, filterType]);

  const loadMore = () => doSearch(query, filterVersion, filterLoader, filterSource, filterType, offset + LIMIT);

  return (
    <div className="modbrowser-overlay" onClick={onClose}>
      <div className="modbrowser-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modbrowser-header">
          <h2>🔍 {filterType === 'mods' ? 'Explorar Mods' : 'Explorar Modpacks'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Filtros */}
        <div className="modbrowser-filters">
          <input
            className="modbrowser-search"
            placeholder={filterType === 'mods' ? 'Buscar mods...' : 'Buscar modpacks...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <Select
            size="sm"
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'mods', label: 'Mods' },
              { value: 'modpacks', label: 'Modpacks' },
            ]}
          />
          <Select
            size="sm"
            value={filterSource}
            onChange={setFilterSource}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              ...(isCurseForgeConfigured() ? [{ value: 'curseforge', label: 'CurseForge' }] : []),
            ]}
          />
          <input
            className="modbrowser-filter-input"
            placeholder="Versión MC"
            value={filterVersion}
            onChange={e => setFilterVersion(e.target.value)}
          />
          <Select
            size="sm"
            value={filterLoader}
            onChange={setFilterLoader}
            placeholder="Todos los loaders"
            options={[
              { value: '', label: 'Todos los loaders' },
              ...LOADERS_MODRINTH.map(l => ({
                value: l,
                label: l.charAt(0).toUpperCase() + l.slice(1),
              })),
            ]}
          />
        </div>

        {/* Cuerpo */}
        <div className="modbrowser-body">

          {/* Lista */}
          <div className="modbrowser-list">
            {loading && results.length === 0 ? (
              <div className="modbrowser-loading">Buscando...</div>
            ) : results.length === 0 ? (
              <div className="modbrowser-loading">No se encontraron mods</div>
            ) : (
              <>
                <div className="modbrowser-count">
                  {total.toLocaleString()} resultados
                </div>
                {results.map(mod => (
                  <ModCard
                    key={mod.project_id}
                    mod={mod}
                    selected={selected?.project_id === mod.project_id}
                    onClick={() => setSelected(mod)}
                    isInstalled={installedIds.some(id => id === mod.project_id || id === mod.slug)}
                  />
                ))}
                {results.length < total && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', marginTop: 8 }}
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'Cargando...' : 'Cargar más'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Detalle */}
          <div className="modbrowser-detail-panel">
            <ModDetail
              mod={selected}
              instance={instance}
              isModpack={filterType === 'modpacks'}
              filterSource={filterSource}
              onInstalled={() => setSelected(null)}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
