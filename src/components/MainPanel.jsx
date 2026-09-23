import { useState, useEffect, useRef } from 'react';
import './MainPanel.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';
import { listMods, getLauncherDir, restoreQuarantine } from '../lib/tauri';
import { formatPlaytime, formatRelativeTime } from '../lib/format';
import ExportInstanceModal from './ExportInstanceModal';
import SettingsPage from './SettingsPage';
import ModpackImportWizard from './ModpackImportWizard';
import { synchronizeInstance } from '../lib/ecosystem-sync';
import WelcomeView from './main-panel/WelcomeView';
import PacksTab from './main-panel/PacksTab';
import ModsTab from './main-panel/ModsTab';
import StatsTab from './main-panel/StatsTab';
import ConsoleTab from './main-panel/ConsoleTab';

/* ─── Helpers ─────────────────────────────────── */
const loaderBadge = (loader) => {
  const l = LOADERS.find(x => x.id === loader);
  return l ? <span className={`badge ${l.color}`}>{l.label}</span> : null;
};

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
