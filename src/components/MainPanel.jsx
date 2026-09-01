import { useState, useEffect, useMemo, useRef } from 'react';
import './MainPanel.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';
import { listMods, deleteMod, toggleMod, getLauncherDir, exportInstanceMods, importInstanceMods, inspectModsZip, ensureDir,
  listResourcePacks, addResourcePack, deleteResourcePack,
  listShaderPacks, addShaderPack, deleteShaderPack,
  pickFile,
  restoreQuarantine,
} from '../lib/tauri';
import { formatPlaytime, formatRelativeTime, formatLogTime } from '../lib/format';
import ImportModsModal from './ImportModsModal';
import ExportInstanceModal from './ExportInstanceModal';
import SettingsPage from './SettingsPage';
import ModpackImportWizard from './ModpackImportWizard';
import { synchronizeInstance } from '../lib/ecosystem-sync';

/* ─── Helpers ─────────────────────────────────── */
const fmtModVersion = (v) =>
  !v || v === 'unknown' || v === 'N/A' || v.includes('${') ? null : v;

const fmtModName = (name, version) => {
  const ver = fmtModVersion(version);
  return ver ? `${name} v${ver}` : name;
};

const loaderBadge = (loader) => {
  const l = LOADERS.find(x => x.id === loader);
  return l ? <span className={`badge ${l.color}`}>{l.label}</span> : null;
};

/* ─── Empty / Welcome ─────────────────────────── */
function WelcomeView() {
  const { openModal } = useStore();
  return (
    <div className="welcome-view">
      <div className="welcome-logo">⛏️</div>
      <h1 className="welcome-title">Bienvenido a <span>Minecrack</span></h1>
      <p className="welcome-subtitle">
        Tu launcher de Minecraft multiplataforma con soporte para Fabric, Forge y Quilt.
        Juega offline con cualquier nick.
      </p>
      <div className="welcome-actions">
        <button
          id="btn-create-first-instance"
          className="btn btn-primary btn-lg"
          onClick={() => openModal('newInstance')}
        >
          ➕ Crear primera instancia
        </button>
        <button
          id="btn-browse-mods-welcome"
          className="btn btn-ghost btn-lg"
          onClick={() => openModal('modBrowser')}
        >
          🔍 Explorar mods
        </button>
      </div>
    </div>
  );
}

/* ─── Pack Tab (Resource Packs / Shaders) ────── */
function PacksTab({ instance, type }) {
  const [loading, setLoading] = useState(false);
  const { state, dispatch, openModal } = useStore();

  const listFn    = type === 'resourcepacks' ? listResourcePacks : listShaderPacks;
  const addFn     = type === 'resourcepacks' ? addResourcePack   : addShaderPack;
  const deleteFn  = type === 'resourcepacks' ? deleteResourcePack : deleteShaderPack;
  const label     = type === 'resourcepacks' ? 'Resource Packs' : 'Shaderpacks';
  const icon      = type === 'resourcepacks' ? '🎨' : '✨';
  const modalName = type === 'resourcepacks' ? 'resourcePackBrowser' : 'shaderPackBrowser';
  const storeKey  = type === 'resourcepacks' ? 'SET_INSTANCE_RESOURCE_PACKS' : 'SET_INSTANCE_SHADERPACKS';

  const packs = type === 'resourcepacks' ? state.instanceResourcePacks : state.instanceShaderpacks;

  const load = async () => {
    setLoading(true);
    try {
      const dir = await getLauncherDir();
      const list = await listFn(dir, instance.id);
      dispatch({ type: storeKey, payload: list });
    } catch (err) {
      console.error(`[PacksTab] Error cargando ${label}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [instance.id]);

  const handleAdd = async () => {
    try {
      const filePath = await pickFile({
        title: `Seleccionar ${label}`,
        filters: [{ name: 'Pack (ZIP)', extensions: ['zip'] }],
      });
      if (!filePath) return;
      const dir = await getLauncherDir();
      await addFn(dir, instance.id, filePath);
      await load();
    } catch (err) {
      console.error(`[PacksTab] Error agregando:`, err);
    }
  };

  const handleDelete = async (filename) => {
    try {
      const dir = await getLauncherDir();
      await deleteFn(dir, instance.id, filename);
      await load();
    } catch (err) {
      console.error(`[PacksTab] Error eliminando:`, err);
    }
  };

  const handleSearchOnline = () => {
    openModal(modalName, { instanceId: instance.id });
  };

  return (
    <div>
      <div className="mods-header">
        <h3>{icon} {label} ({packs.length})</h3>
        <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSearchOnline} disabled={loading}>
            🔍 Buscar en línea
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={loading}>
            + Agregar local
          </button>
        </div>
      </div>
      {packs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">{icon}</div>
          <h3 className="empty-state-title">Sin {label.toLowerCase()}</h3>
          <p className="empty-state-desc">
            Agrega {type === 'resourcepacks' ? 'texture packs o resource packs' : 'shaders (Iris/OptiFine)'} en formato ZIP.
          </p>
          <button className="empty-state-cta empty-state-cta-primary" onClick={handleAdd}>
            {icon} Agregar {label}
          </button>
        </div>
      ) : (
        <div className="mods-list" style={{ marginTop: 12 }}>
          {packs.map(pack => (
            <div key={pack.filename} className="mod-row">
              <div className="mod-row-icon">{icon}</div>
              <div className="mod-row-info">
                <div className="mod-row-name">{pack.name}</div>
                <div className="mod-row-version">{pack.filename}</div>
              </div>
              <div className="mod-row-actions">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(pack.filename)}
                >✕ Quitar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Mods Tab ────────────────────────────────── */
function ModsTab({ instance }) {
  const { state, dispatch, openModal } = useStore();
  const mods = state.instanceMods ?? [];
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [expandedMod, setExpandedMod] = useState(null); // filename del mod expandido
  const [searchQuery, setSearchQuery] = useState('');

  // View mode: 'grid' | 'list' | 'compact' — persisted in localStorage
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('minecrack.modsViewMode') || 'grid'; }
    catch { return 'grid'; }
  });

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null); // { count, size, path } o null

  const changeViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('minecrack.modsViewMode', mode); } catch {}
  };

  // Filtrar mods por búsqueda
  const q = searchQuery.trim().toLowerCase();
  const filteredMods = q
    ? mods.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.filename.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      )
    : mods;

  const handleDelete = async (filename) => {
    try {
      const launcherDir = await getLauncherDir();
      await deleteMod(launcherDir, instance.id, filename);
      const updated = await listMods(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
    } catch (err) {
      console.error('[ModsTab] Error eliminando mod:', err);
    }
  };

  const handleToggle = async (filename, currentEnabled) => {
    try {
      const launcherDir = await getLauncherDir();
      await toggleMod(launcherDir, instance.id, filename, !currentEnabled);
      const updated = await listMods(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
    } catch (err) {
      console.error('[ModsTab] Error cambiando estado del mod:', err);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportSuccess(null);
      const launcherDir = await getLauncherDir();
      const exportsDir = `${launcherDir}/exports`;
      const zipPath = `${exportsDir}/${instance.name}-mods.zip`;

      // Crear directorio de exports
      await ensureDir(exportsDir);

      const result = await exportInstanceMods(launcherDir, instance.id, zipPath);
      const sizeMB = (result.size_bytes / (1024 * 1024)).toFixed(2);

      setExportSuccess({
        count: result.mod_count,
        size: sizeMB,
        path: zipPath,
        filename: `${instance.name}-mods.zip`,
      });

      // Auto-hide notification after 4 seconds
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      console.error('[ModsTab] Error exportando mods:', err);
      // Could show error notification here too
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mods-header">
        <h3>
          Mods instalados
          {' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            ({q ? `${filteredMods.length}/${mods.length}` : mods.length})
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View mode toggle */}
          <div className="mods-view-toggle">
            <button
              className={`mods-view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => changeViewMode('grid')}
              title="Vista en cuadrícula"
            >⊞</button>
            <button
              className={`mods-view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => changeViewMode('list')}
              title="Vista en lista"
            >≡</button>
            <button
              className={`mods-view-btn${viewMode === 'compact' ? ' active' : ''}`}
              onClick={() => changeViewMode('compact')}
              title="Vista compacta"
            >·</button>
          </div>

          <button
            id="btn-add-mod"
            className="btn btn-primary btn-sm"
            onClick={() => openModal('modBrowser', { instanceId: instance.id })}
            disabled={loading}
          >
            + Añadir mod
          </button>
          <button
            id="btn-export-mods"
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={loading || exporting || mods.length === 0}
            title="Exportar mods como ZIP"
          >
            {exporting ? '⏳ Exportando...' : '📦 Exportar'}
          </button>
          <button
            id="btn-import-mods"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowImportModal(true)}
            disabled={loading}
            title="Importar mods desde ZIP"
          >
            📥 Importar
          </button>
        </div>
      </div>

      {showImportModal && (
        <ImportModsModal
          instanceId={instance.id}
          onClose={() => {
            setShowImportModal(false);
            // Recargar mods después de cerrar
            const loadMods = async () => {
              try {
                const launcherDir = await getLauncherDir();
                const updated = await listMods(launcherDir, instance.id);
                dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
              } catch (err) {
                console.error('[ModsTab] Error recargando mods:', err);
              }
            };
            loadMods();
          }}
        />
      )}

      {/* Barra de búsqueda */}
      {mods.length > 0 && (
        <div className="mods-search-bar">
          <input
            type="search"
            className="mods-search-input"
            placeholder="🔍 Buscar mod..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="mods-search-clear"
              onClick={() => setSearchQuery('')}
              title="Limpiar búsqueda"
            >✕</button>
          )}
        </div>
      )}

      {/* Export success notification */}
      {exportSuccess && (
        <div className="export-notification">
          <div className="export-notification-content">
            <div className="export-notification-icon">✓</div>
            <div className="export-notification-text">
              <div className="export-notification-title">Exportado: {exportSuccess.filename}</div>
              <div className="export-notification-details">
                {exportSuccess.count} mod(s) • {exportSuccess.size} MB
              </div>
            </div>
          </div>
        </div>
      )}

      {mods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">🧩</div>
          <h3 className="empty-state-title">Sin mods instalados</h3>
          <p className="empty-state-desc">
            Agrega mods desde el catálogo de Modrinth/CurseForge o importa un ZIP existente.
          </p>
          <div className="empty-state-actions">
            <button
              className="empty-state-cta empty-state-cta-primary"
              onClick={() => openModal('modBrowser', { instanceId: instance.id })}
            >🔍 Explorar mods</button>
            <button
              className="empty-state-cta"
              onClick={() => setShowImportModal(true)}
            >📥 Importar ZIP</button>
          </div>
        </div>
      ) : filteredMods.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="empty-state-illustration" style={{ fontSize: 32 }}>🔍</div>
          <h3 className="empty-state-title" style={{ fontSize: 15 }}>Sin resultados para "{searchQuery}"</h3>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setSearchQuery('')}>
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className={
          viewMode === 'grid'    ? 'mods-grid'
          : viewMode === 'list'  ? 'mods-list'
          : 'mods-compact'
        }>
          {filteredMods.map(mod => {
            const isExpanded = expandedMod === mod.filename;

            if (viewMode === 'compact') {
              return (
                <div key={mod.filename}>
                  <div
                    className={`mod-row-compact${!mod.enabled ? ' disabled' : ''}`}
                    onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                    style={{ cursor: 'pointer' }}
                  >
                    {mod.iconBase64
                      ? <img src={mod.iconBase64} alt="" className="mod-compact-icon" />
                      : <span className={`mod-compact-dot${!mod.enabled ? ' off' : ''}`} />
                    }
                    <span className="mod-compact-name">{fmtModName(mod.name, mod.version)}</span>
                    <div className="mod-compact-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                        {mod.enabled ? '🔒' : '🔓'}
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                    </div>
                  </div>
                  {isExpanded && mod.description && (
                    <div className="mod-description-panel">{mod.description}</div>
                  )}
                  {isExpanded && !mod.description && (
                    <div className="mod-description-panel mod-description-empty">Sin descripción disponible</div>
                  )}
                </div>
              );
            }

            if (viewMode === 'list') {
              return (
                <div key={mod.filename}>
                  <div
                    className={`mod-row${!mod.enabled ? ' disabled' : ''}`}
                    onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="mod-row-icon">
                      {mod.iconBase64
                        ? <img src={mod.iconBase64} alt="" className="mod-icon-img" />
                        : (mod.enabled ? '🧩' : '⊘')
                      }
                    </div>
                    <div className="mod-row-info">
                      <div className="mod-row-name">{fmtModName(mod.name, mod.version)}</div>
                    </div>
                    <div className="mod-row-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                        {mod.enabled ? '🔒' : '🔓'}
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className={`mod-description-panel${!mod.description ? ' mod-description-empty' : ''}`}>
                      {mod.description || 'Sin descripción disponible'}
                    </div>
                  )}
                </div>
              );
            }

            // Default: grid
            return (
              <div
                key={mod.filename}
                className={`mod-card${!mod.enabled ? ' disabled' : ''}${isExpanded ? ' expanded' : ''}`}
                onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                style={{ cursor: 'pointer' }}
              >
                <div className="mod-icon-box">
                  {mod.iconBase64
                    ? <img src={mod.iconBase64} alt="" className="mod-icon-img" />
                    : (mod.enabled ? '🧩' : '⊘')
                  }
                </div>
                <div className="mod-info">
                  <div className="mod-name">{fmtModName(mod.name, mod.version)}</div>
                  {isExpanded && (
                    <div className="mod-expanded-desc">
                      {mod.description || 'Sin descripción disponible'}
                    </div>
                  )}
                  <div className="mod-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                      {mod.enabled ? '🔒' : '🔓'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Stats Tab ───────────────────────────────── */
function StatsTab({ instance }) {
  const { dispatch } = useStore();
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');

  const canReinstallLoader = instance.loader === 'forge' || instance.loader === 'neoforge';

  async function handleReinstallLoader() {
    if (!confirm(`Esto re-descargará todas las librerías de ${instance.loader}. ¿Continuar?`)) return;
    setRepairing(true);
    setRepairStatus('Iniciando reparación…');
    try {
      const { deleteFile } = await import('../lib/tauri');
      const { installLoader } = await import('../lib/loaders');
      const { downloadQueue } = await import('../lib/downloader');
      const { readFile, getLauncherDir } = await import('../lib/tauri');
      const { LAUNCHER } = await import('../config');

      const launcherDir = await getLauncherDir();
      const profileId = instance.loader === 'forge'
        ? instance.loaderVersion
        : `${instance.version}-${instance.loader}-${instance.loaderVersion}`;
      const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;

      // Cargar versionData vanilla (necesario para installLoader)
      const vanillaJson = await readFile(`${launcherDir}/versions/${instance.version}/${instance.version}.json`);
      const versionData = JSON.parse(vanillaJson);

      setRepairStatus('Borrando perfil antiguo…');
      try { await deleteFile(profilePath); } catch { /* ok si no existe */ }

      setRepairStatus(`Regenerando perfil de ${instance.loader}…`);
      const result = await installLoader(
        instance.loader, instance.loaderVersion, instance.version, launcherDir, versionData
      );

      if (result.downloadTasks?.length > 0) {
        setRepairStatus(`Descargando ${result.downloadTasks.length} archivos…`);
        await new Promise((resolve, reject) => {
          const q = downloadQueue({
            tasks: result.downloadTasks,
            concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
            onProgress: (p) => setRepairStatus(`Descargando ${p.done}/${p.total}: ${p.label}`),
            onDone: ({ failed }) => failed > 0
              ? reject(new Error(`${failed} archivos fallaron`))
              : resolve(),
          });
          q.run();
        });
      }

      setRepairStatus('✓ Reparación completada');
      setTimeout(() => { setRepairing(false); setRepairStatus(''); }, 1500);
    } catch (err) {
      console.error('[Reinstall] Error:', err);
      setRepairStatus(`✗ Error: ${err.message || err}`);
      dispatch({ type: 'SET_ERROR', payload: err.message || String(err) });
      setTimeout(() => { setRepairing(false); setRepairStatus(''); }, 3000);
    }
  }

  return (
    <div>
      <div className="stats-grid">
        {[
          { label: 'Tiempo jugado', value: formatPlaytime(instance.playtime ?? 0), accent: true },
          { label: 'Mods instalados', value: instance.mods?.length ?? 0, accent: false },
          { label: 'RAM asignada', value: `${instance.ram ?? 2048} MB`, accent: false },
          { label: 'Loader', value: LOADERS.find(l => l.id === instance.loader)?.label ?? 'Vanilla', accent: false },
          { label: 'Versión MC', value: instance.version, accent: false },
          { label: 'Creado', value: new Date(instance.createdAt).toLocaleDateString(), accent: false },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value${s.accent ? ' accent' : ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {canReinstallLoader && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            🔧 Reparación del loader
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Si tienes errores como <code>ClassNotFoundException</code> al lanzar,
            re-instala el loader para descargar archivos faltantes.
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleReinstallLoader}
            disabled={repairing}
          >
            {repairing ? '⏳ Reparando…' : `🔄 Reinstalar ${instance.loader}`}
          </button>
          {repairStatus && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              {repairStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Console Tab ─────────────────────────────── */
function ConsoleTab() {
  const { state, dispatch } = useStore();
  const { gameLogs, gameRunning } = state;
  const [filter, setFilter] = useState('all');         // 'all' | 'info' | 'warn' | 'error'
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef(null);
  const lastScrollHeight = useRef(0);

  // Contadores por nivel
  const counts = useMemo(() => {
    const c = { all: gameLogs.length, info: 0, warn: 0, error: 0 };
    for (const log of gameLogs) {
      const lvl = log.level ?? 'info';
      if (lvl === 'warn' || lvl === 'error') c[lvl]++;
      else c.info++;
    }
    return c;
  }, [gameLogs]);

  // Logs filtrados (por nivel + búsqueda)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gameLogs.filter(log => {
      const lvl = log.level ?? 'info';
      if (filter !== 'all') {
        if (filter === 'info' && (lvl === 'warn' || lvl === 'error')) return false;
        if (filter === 'warn' && lvl !== 'warn') return false;
        if (filter === 'error' && lvl !== 'error') return false;
      }
      if (q && !String(log.text).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gameLogs, filter, search]);

  // Auto-scroll al fondo cuando llegan nuevos logs (si está activo)
  useEffect(() => {
    if (!bodyRef.current) return;
    if (autoScroll) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
    lastScrollHeight.current = bodyRef.current.scrollHeight;
  }, [filtered.length, autoScroll]);

  // Detectar scroll manual del usuario para pausar auto-scroll
  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 50;
    setAutoScroll(nearBottom);
  }

  function jumpToBottom() {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    setAutoScroll(true);
  }

  function copyAll() {
    navigator.clipboard.writeText(filtered.map(l => l.text).join('\n'));
  }

  function clearAll() {
    if (gameRunning) return;
    dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
  }

  // Highlight de matches dentro de una línea
  function highlightMatch(text) {
    if (!search.trim()) return text;
    const q = search.trim();
    const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'ig'));
    return parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase()
        ? <mark key={i}>{p}</mark>
        : <span key={i}>{p}</span>
    );
  }

  // Empty state cuando no hay logs ni juego
  if (gameLogs.length === 0) {
    return (
      <div className="console-wrap">
        <div className="console-empty">
          <div className="empty-state">
            <div className="empty-state-illustration">💻</div>
            <h3 className="empty-state-title">Consola vacía</h3>
            <p className="empty-state-desc">
              {gameRunning
                ? 'El juego está iniciando — los logs aparecerán pronto…'
                : 'Inicia el juego para ver los logs aquí. La consola muestra mensajes del cliente Minecraft y el loader.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-wrap">
      {/* Header con filtros, búsqueda y acciones */}
      <div className="console-header">
        <div className="console-filters">
          <button
            className={`console-chip${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todo <span className="console-chip-count">{counts.all}</span>
          </button>
          <button
            className={`console-chip${filter === 'info' ? ' is-active' : ''}`}
            onClick={() => setFilter('info')}
          >
            Info <span className="console-chip-count">{counts.info}</span>
          </button>
          <button
            className={`console-chip chip-warn${filter === 'warn' ? ' is-active' : ''}`}
            onClick={() => setFilter('warn')}
          >
            Warn <span className="console-chip-count">{counts.warn}</span>
          </button>
          <button
            className={`console-chip chip-error${filter === 'error' ? ' is-active' : ''}`}
            onClick={() => setFilter('error')}
          >
            Error <span className="console-chip-count">{counts.error}</span>
          </button>
        </div>

        <input
          type="text"
          className="console-search"
          placeholder="Buscar en logs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="console-actions">
          <button
            className="console-action-btn"
            onClick={copyAll}
            title="Copiar logs visibles"
          >📋 Copiar</button>
          <button
            className="console-action-btn"
            onClick={clearAll}
            title="Limpiar consola (solo si el juego no está corriendo)"
            disabled={gameRunning}
          >🗑 Limpiar</button>
        </div>
      </div>

      {/* Body con logs */}
      <div
        ref={bodyRef}
        className="console-body"
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="console-empty">
            <div className="empty-state">
              <p className="empty-state-desc">
                Sin resultados con los filtros actuales.
              </p>
            </div>
          </div>
        ) : (
          // Render solo las últimas 1000 líneas para performance
          filtered.slice(-1000).map((line, i) => {
            const lvl = line.level ?? 'info';
            const time = line.timestamp ? formatLogTime(line.timestamp) : formatLogTime();
            return (
              <div key={i} className="console-line">
                <span className="console-line-time">{time}</span>
                <span className={`console-line-level console-line-level-${lvl}`}>{lvl}</span>
                <span className="console-line-msg">{highlightMatch(line.text)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Floating button para saltar al final si el user scrolleó arriba */}
      {!autoScroll && filtered.length > 0 && (
        <button className="console-jump-bottom" onClick={jumpToBottom}>
          ↓ Saltar al final
        </button>
      )}
    </div>
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ─── Instance Detail ─────────────────────────── */
function InstanceDetail({ instance }) {
  const [activeTab, setActiveTab] = useState('mods');
  const [showExportModal, setShowExportModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const syncPromiseRef = useRef(null);
  const { state, dispatch, openModal } = useStore();

  // Ctrl+` abre la consola
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setActiveTab('console');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const { gameRunning, gameInstanceId } = state;

  const isThisRunning = gameRunning && gameInstanceId === instance.id;

  const runSync = async () => {
    if (!instance.remoteModpack) return null;
    if (syncPromiseRef.current) return syncPromiseRef.current;
    const promise = (async () => {
      setSyncing(true);
      setSyncProgress({ phase: 'manifest', label: 'Consultando manifiesto…', percent: 0 });
      try {
        const result = await synchronizeInstance(instance, setSyncProgress);
        dispatch({ type: 'UPDATE_INSTANCE', payload: {
          id: instance.id,
          lastSyncedReleaseId: result.releaseId,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'ready',
          lastQuarantinePath: result.quarantinePath ?? null,
        }});
        const launcherDir = await getLauncherDir();
        const mods = await listMods(launcherDir, instance.id);
        dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });
        return result;
      } catch (error) {
        dispatch({ type: 'UPDATE_INSTANCE', payload: { id: instance.id, lastSyncStatus: 'error' } });
        throw error;
      } finally {
        setSyncing(false);
        syncPromiseRef.current = null;
      }
    })();
    syncPromiseRef.current = promise;
    return promise;
  };

  // Cargar mods cuando la instancia se selecciona
  useEffect(() => {
    const loadMods = async () => {
      try {
        const launcherDir = await getLauncherDir();
        const mods = await listMods(launcherDir, instance.id);
        dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });
      } catch (err) {
        console.error('[InstanceDetail] Error cargando mods:', err);
      }
    };
    loadMods();
  }, [instance.id, dispatch]);

  useEffect(() => {
    if (!instance.remoteModpack) return;
    runSync().catch(error => {
      console.error('[EcosystemSync] Error:', error);
      setSyncProgress({ phase: 'error', label: error?.message || String(error), percent: 0 });
    });
  // Solo repetir si cambia el vínculo remoto o se selecciona otra instancia.
  }, [instance.id, instance.remoteModpack?.apiBaseUrl, instance.remoteModpack?.modpackId,
    instance.remoteModpack?.tracking, instance.remoteModpack?.releaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlay = async () => {
    if (isThisRunning) {
      dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
      return;
    }

    // Si la instancia no está instalada → abrir descarga primero
    if (!instance.installed) {
      openModal('download', {
        versionId:    instance.version,
        instanceName: instance.name,
        instanceId:   instance.id,
      });
      return;
    }

    if (instance.remoteModpack) {
      try {
        await runSync();
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: `No se puede jugar hasta completar la sincronización: ${error?.message || error}` });
        return;
      }
    }

    dispatch({ type: 'SET_GAME_RUNNING', payload: { running: true, instanceId: instance.id } });
  };

  const modsCount = (state.instanceMods ?? []).length;
  const tabs = [
    { id: 'mods',          label: `🧩 Mods${modsCount > 0 ? ` (${modsCount})` : ''}` },
    { id: 'resourcepacks', label: '🎨 Recursos' },
    { id: 'shaderpacks',   label: '✨ Shaders' },
    { id: 'stats',         label: '📊 Stats' },
    { id: 'console',       label: '💻 Consola' },
  ];

  return (
    <div className="instance-detail">
      {/* Hero */}
      <div className="instance-hero">
        <div className="instance-hero-bg" />
        <div className="instance-hero-content">
          <div className="instance-big-icon">{instance.icon}</div>
          <div className="instance-hero-info">
            <h2 className="instance-hero-name">{instance.name}</h2>
            <div className="instance-hero-meta">
              <span className="badge badge-gray">MC {instance.version}</span>
              {loaderBadge(instance.loader)}
              <span className="badge badge-gray">
                {state.instanceMods?.length ?? 0} mods
              </span>
              {isThisRunning && (
                <span className="status-pill status-pill-running">
                  <span className="dot" />
                  Jugando
                </span>
              )}
              {instance.remoteModpack && (
                <span className={`status-pill ${instance.lastSyncStatus === 'ready' ? 'status-pill-running' : ''}`}>
                  ☁ {syncing ? 'Sincronizando' : instance.lastSyncStatus === 'ready' ? `Release ${instance.lastSyncedReleaseId}` : 'Remoto'}
                </span>
              )}
            </div>
            <div className="hero-meta">
              <span className="hero-meta-item" title="Tiempo total jugado">
                <span className="icon">🕒</span>
                Jugado {formatPlaytime(instance.playtime ?? 0)}
              </span>
              <span className="hero-meta-item" title="Última vez que se ejecutó">
                <span className="icon">📅</span>
                Último: {formatRelativeTime(instance.lastPlayed)}
              </span>
              <span className="hero-meta-item" title="RAM asignada">
                <span className="icon">💾</span>
                {((instance.ram ?? 2048) / 1024).toFixed(1)} GB RAM
              </span>
            </div>
          </div>
          <div className="instance-hero-actions">
            {!instance.remoteModpack && instance.lastQuarantinePath && <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const launcherDir = await getLauncherDir();
                  const restored = await restoreQuarantine(launcherDir, instance.id, instance.lastQuarantinePath);
                  dispatch({ type: 'UPDATE_INSTANCE', payload: { id: instance.id, lastQuarantinePath: null } });
                  dispatch({ type: 'SET_INSTANCE_MODS', payload: await listMods(launcherDir, instance.id) });
                  setSyncProgress({ phase: 'done', label: `${restored} archivo(s) restaurado(s)`, percent: 100 });
                } catch (error) {
                  dispatch({ type: 'SET_ERROR', payload: error?.message || String(error) });
                }
              }}
              title="Restaurar última cuarentena"
            >↩</button>}
            {instance.remoteModpack && <button
              className="btn btn-ghost"
              onClick={() => runSync().catch(error => dispatch({ type: 'SET_ERROR', payload: error?.message || String(error) }))}
              disabled={syncing || isThisRunning}
              title="Sincronizar modpack oficial"
            >☁</button>}
            <button
              id="btn-verify-instance"
              className="btn btn-ghost"
              onClick={() => openModal('verifyInstance', { instanceId: instance.id })}
              title="Verificar/Reparar instalación"
            >🔍</button>
            <button
              id="btn-instance-settings"
              className="btn btn-ghost"
              onClick={() => openModal('instanceSettings', { instanceId: instance.id })}
              title="Configuración de instancia"
            >⚙</button>
            <button
              id="btn-export-instance"
              className="btn btn-ghost"
              onClick={() => setShowExportModal(true)}
              title="Hacer backup de instancia"
            >💾</button>
            <button
              id="btn-play-instance"
              className={`btn-play${isThisRunning ? ' running' : ''}${!instance.installed ? ' install' : ''}`}
              style={!instance.installed ? {
                background: 'linear-gradient(135deg, #1565c0, #1976d2)',
                boxShadow: '0 4px 20px rgba(25,118,210,0.3)',
                animation: 'none',
              } : {}}
              onClick={handlePlay}
              disabled={syncing}
            >
              <span className="btn-play-icon">
                {syncing ? '↻' : isThisRunning ? '⏹' : instance.installed ? '▶' : '⬇'}
              </span>
              {syncing ? 'Sincronizando' : isThisRunning ? 'Detener' : instance.installed ? 'Jugar' : 'Instalar'}
            </button>
          </div>
        </div>
      </div>

      {instance.remoteModpack && syncProgress && (
        <div className={`ecosystem-sync ${syncProgress.phase === 'error' ? 'error' : ''}`}>
          <div><strong>{syncProgress.phase === 'done' ? '✓ Modpack listo' : 'Sincronización oficial'}</strong><span>{syncProgress.label}</span></div>
          <div className="ecosystem-sync-track"><div style={{ width: `${Math.max(0, Math.min(100, syncProgress.percent ?? 0))}%` }} /></div>
          <span>{Math.round(syncProgress.percent ?? 0)}%</span>
        </div>
      )}

      {/* Tabs */}
      <div className="instance-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className={`instance-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="instance-content">
        {activeTab === 'mods'          && <ModsTab  instance={instance} />}
        {activeTab === 'resourcepacks' && <PacksTab instance={instance} type="resourcepacks" />}
        {activeTab === 'shaderpacks'   && <PacksTab instance={instance} type="shaderpacks" />}
        {activeTab === 'stats'         && <StatsTab instance={instance} />}
        {activeTab === 'console'       && <ConsoleTab />}
      </div>

      {/* Export instance modal */}
      {showExportModal && (
        <ExportInstanceModal
          instance={instance}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

/* ─── Main Panel ──────────────────────────────── */
export default function MainPanel() {
  const { state, dispatch } = useStore();
  const { instances, selectedInstanceId, activeTab, modpackImportMode } = state;
  const selected = instances.find(i => i.id === selectedInstanceId);

  // Global tabs take priority over instance view
  if (activeTab === 'settings') {
    return (
      <main className="main-panel">
        <SettingsPage />
      </main>
    );
  }

  // Modpack import wizard mode
  if (modpackImportMode) {
    return (
      <main className="main-panel">
        <ModpackImportWizard
          onClose={() => dispatch({ type: 'SET_MODPACK_IMPORT_MODE', payload: false })}
        />
      </main>
    );
  }

  return (
    <main className="main-panel">
      {selected ? <InstanceDetail instance={selected} /> : <WelcomeView />}
    </main>
  );
}
