import { useState, useEffect } from 'react';
import './MainPanel.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';
import { listMods, deleteMod, toggleMod, getLauncherDir, exportInstanceMods, importInstanceMods, inspectModsZip, ensureDir } from '../lib/tauri';
import ImportModsModal from './ImportModsModal';

/* ─── Helpers ─────────────────────────────────── */
const loaderBadge = (loader) => {
  const l = LOADERS.find(x => x.id === loader);
  return l ? <span className={`badge ${l.color}`}>{l.label}</span> : null;
};

const formatPlaytime = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
      setLoading(true);
      const launcherDir = await getLauncherDir();
      const zipPath = `${launcherDir}/exports/${instance.name}-mods.zip`;

      // Crear directorio de exports
      await ensureDir(`${launcherDir}/exports`);

      const result = await exportInstanceMods(launcherDir, instance.id, zipPath);
      const sizeMB = (result.size_bytes / (1024 * 1024)).toFixed(2);
      alert(`✅ Mods exportados\n📦 ${result.mod_count} mods\n📁 ${sizeMB} MB`);
    } catch (err) {
      console.error('[ModsTab] Error exportando mods:', err);
      alert(`❌ Error exportando: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mods-header">
        <h3>Mods instalados ({mods.length})</h3>
        <div style={{ display: 'flex', gap: 8 }}>
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
            disabled={loading || mods.length === 0}
            title="Exportar mods como ZIP"
          >
            📦 Exportar
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
      {mods.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧩</div>
          <p>No hay mods instalados en esta instancia.</p>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => openModal('modBrowser', { instanceId: instance.id })}
          >Explorar mods</button>
        </div>
      ) : (
        <div className="mods-grid">
          {mods.map(mod => (
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
          ))}
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
  const { state } = useStore();
  const { gameLogs } = state;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Consola del juego</h3>
        <button
          id="btn-copy-log"
          className="btn btn-ghost btn-sm"
          onClick={() => navigator.clipboard.writeText(gameLogs.map(l => l.text).join('\n'))}
        >📋 Copiar</button>
      </div>
      <div className="console-box">
        {gameLogs.length === 0
          ? <span style={{ color: 'var(--text-muted)' }}>El juego no está corriendo...</span>
          : gameLogs.map((line, i) => (
            <div key={i} className={`log-line log-${line.level ?? 'info'}`}>
              {line.text}
            </div>
          ))
        }
      </div>
    </div>
  );
}

/* ─── Instance Detail ─────────────────────────── */
function InstanceDetail({ instance }) {
  const [activeTab, setActiveTab] = useState('mods');
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
                {instance.mods?.length ?? 0} mods
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
    </div>
  );
}

/* ─── Main Panel ──────────────────────────────── */
export default function MainPanel() {
  const { state } = useStore();
  const { instances, selectedInstanceId } = state;
  const selected = instances.find(i => i.id === selectedInstanceId);

  return (
    <main className="main-panel">
      {selected ? <InstanceDetail instance={selected} /> : <WelcomeView />}
    </main>
  );
}
