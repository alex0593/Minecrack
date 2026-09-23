import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { listMods, getLauncherDir, restoreQuarantine } from '../../lib/tauri';
import ExportInstanceModal from '../ExportInstanceModal';
import { synchronizeInstance } from '../../lib/ecosystem-sync';
import InstanceHero from './InstanceHero';
import SyncStatusBar from './SyncStatusBar';
import InstanceTabs from './InstanceTabs';
import ModsTab from './ModsTab';
import PacksTab from './PacksTab';
import StatsTab from './StatsTab';
import ConsoleTab from './ConsoleTab';

/* ─── Instance Detail ─────────────────────────── */
/** InstanceDetail — vista de detalle de la instancia: hero, sincronización, pestañas y contenido */
export default function InstanceDetail({ instance }) {
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

  const handleRestoreQuarantine = async () => {
    try {
      const launcherDir = await getLauncherDir();
      const restored = await restoreQuarantine(launcherDir, instance.id, instance.lastQuarantinePath);
      dispatch({ type: 'UPDATE_INSTANCE', payload: { id: instance.id, lastQuarantinePath: null } });
      dispatch({ type: 'SET_INSTANCE_MODS', payload: await listMods(launcherDir, instance.id) });
      setSyncProgress({ phase: 'done', label: `${restored} archivo(s) restaurado(s)`, percent: 100 });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error?.message || String(error) });
    }
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
      <InstanceHero
        instance={instance}
        modsCount={modsCount}
        isThisRunning={isThisRunning}
        syncing={syncing}
        onPlay={handlePlay}
        onSync={() => runSync().catch(error => dispatch({ type: 'SET_ERROR', payload: error?.message || String(error) }))}
        onRestoreQuarantine={handleRestoreQuarantine}
        onVerify={() => openModal('verifyInstance', { instanceId: instance.id })}
        onSettings={() => openModal('instanceSettings', { instanceId: instance.id })}
        onShowExport={() => setShowExportModal(true)}
      />

      {instance.remoteModpack && syncProgress && (
        <SyncStatusBar progress={syncProgress} />
      )}

      {/* Tabs */}
      <InstanceTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

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
