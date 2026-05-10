import { useState, useEffect, useMemo, useRef } from 'react';
import './MainPanel.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';
import { listMods, deleteMod, toggleMod, getLauncherDir, exportInstanceMods, importInstanceMods, inspectModsZip, ensureDir } from '../lib/tauri';
import { formatPlaytime, formatRelativeTime, formatLogTime } from '../lib/format';
import ImportModsModal from './ImportModsModal';
import ExportInstanceModal from './ExportInstanceModal';
import ModpackBrowser from './ModpackBrowser';
import SettingsPage from './SettingsPage';

/* ─── Helpers ─────────────────────────────────── */
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

/* ─── Mods Tab ────────────────────────────────── */
function ModsTab({ instance }) {
  const { state, dispatch, openModal } = useStore();
  const mods = state.instanceMods ?? [];
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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
        <h3>Mods instalados ({mods.length})</h3>
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
      ) : (
        <div className={
          viewMode === 'grid'    ? 'mods-grid'
          : viewMode === 'list'  ? 'mods-list'
          : 'mods-compact'
        }>
          {mods.map(mod => {
            if (viewMode === 'compact') {
              return (
                <div key={mod.filename} className={`mod-row-compact${!mod.enabled ? ' disabled' : ''}`}>
                  <span className={`mod-compact-dot${!mod.enabled ? ' off' : ''}`} />
                  <span className="mod-compact-name">{mod.name}</span>
                  <span className="mod-compact-version">{mod.version}</span>
                  <div className="mod-compact-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleToggle(mod.filename, mod.enabled)}
                    >
                      {mod.enabled ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(mod.filename)}
                    >✕</button>
                  </div>
                </div>
              );
            }

            if (viewMode === 'list') {
              return (
                <div key={mod.filename} className={`mod-row${!mod.enabled ? ' disabled' : ''}`}>
                  <div className="mod-row-icon">{mod.enabled ? '🧩' : '⊘'}</div>
                  <div className="mod-row-info">
                    <div className="mod-row-name">{mod.name}</div>
                    <div className="mod-row-version">{mod.version}</div>
                  </div>
                  <div className="mod-row-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleToggle(mod.filename, mod.enabled)}
                    >
                      {mod.enabled ? '🔒 Desactivar' : '🔓 Activar'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(mod.filename)}
                    >✕ Quitar</button>
                  </div>
                </div>
              );
            }

            // Default: grid
            return (
              <div key={mod.filename} className={`mod-card${!mod.enabled ? ' disabled' : ''}`}>
                <div className="mod-icon-box">{mod.enabled ? '🧩' : '⊘'}</div>
                <div className="mod-info">
                  <div className="mod-name">{mod.name}</div>
                  <div className="mod-desc">{mod.version}</div>
                  <div className="mod-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleToggle(mod.filename, mod.enabled)}
                    >
                      {mod.enabled ? '🔒 Desactivar' : '🔓 Activar'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(mod.filename)}
                    >
                      ✕ Quitar
                    </button>
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

  const handlePlay = () => {
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

    dispatch({ type: 'SET_GAME_RUNNING', payload: { running: true, instanceId: instance.id } });
  };

  const tabs = [
    { id: 'mods',    label: '🧩 Mods' },
    { id: 'stats',   label: '📊 Estadísticas' },
    { id: 'console', label: '💻 Consola' },
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
            >
              <span className="btn-play-icon">
                {isThisRunning ? '⏹' : instance.installed ? '▶' : '⬇'}
              </span>
              {isThisRunning ? 'Detener' : instance.installed ? 'Jugar' : 'Instalar'}
            </button>
          </div>
        </div>
      </div>

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
        {activeTab === 'mods'    && <ModsTab    instance={instance} />}
        {activeTab === 'stats'   && <StatsTab   instance={instance} />}
        {activeTab === 'console' && <ConsoleTab />}
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
  const { state } = useStore();
  const { instances, selectedInstanceId, activeTab } = state;
  const selected = instances.find(i => i.id === selectedInstanceId);

  // Global tabs take priority over instance view
  if (activeTab === 'settings') {
    return (
      <main className="main-panel">
        <SettingsPage />
      </main>
    );
  }

  if (activeTab === 'mods') {
    return (
      <main className="main-panel">
        <ModpackBrowser />
      </main>
    );
  }

  return (
    <main className="main-panel">
      {selected ? <InstanceDetail instance={selected} /> : <WelcomeView />}
    </main>
  );
}
