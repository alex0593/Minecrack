import './index.css';
import './App.css';
import { useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import { useGameLauncher }         from './hooks/useGameLauncher';
import { useInstancePersistence }  from './hooks/useInstancePersistence';
import TitleBar          from './components/TitleBar';
import Sidebar           from './components/Sidebar';
import MainPanel         from './components/MainPanel';
import ProfileModal      from './components/ProfileModal';
import NewInstanceModal  from './components/NewInstanceModal';
import DownloadOverlay   from './components/DownloadOverlay';
import ModBrowserModal       from './components/ModBrowserModal';
import ResourcePackBrowserModal from './components/ResourcePackBrowserModal';
import ShaderPackBrowserModal from './components/ShaderPackBrowserModal';
import InstanceSettingsModal from './components/InstanceSettingsModal';
import VerifyInstanceModal   from './components/VerifyInstanceModal';
import SetupWizard           from './components/SetupWizard';

function ErrorModal() {
  const { state, dispatch } = useStore();
  const { errorMessage } = state;
  if (!errorMessage) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 520, width: '90%',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>❌</span>
          <h2 style={{ margin: 0, color: 'var(--red)' }}>Error al lanzar el juego</h2>
        </div>
        <pre style={{
          background: 'var(--bg-base)', color: 'var(--text-secondary)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '12px 14px', fontSize: 12, fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          userSelect: 'text', cursor: 'text',
          maxHeight: 240, overflowY: 'auto', margin: '0 0 20px',
        }}>
          {errorMessage}
        </pre>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigator.clipboard.writeText(errorMessage)}
          >
            📋 Copiar error
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Modals() {
  const { state, closeModal, dispatch } = useStore();
  const { modal, modalData } = state;
  if (!modal) return null;
  if (modal === 'profile')     return <ProfileModal />;
  if (modal === 'newInstance') return <NewInstanceModal />;
  if (modal === 'instanceSettings') return (
    <InstanceSettingsModal
      instanceId={modalData?.instanceId}
      onClose={closeModal}
    />
  );
  if (modal === 'verifyInstance') return (
    <VerifyInstanceModal
      instanceId={modalData?.instanceId}
      onClose={closeModal}
    />
  );
  if (modal === 'modBrowser')  return (
    <ModBrowserModal
      instanceId={modalData?.instanceId}
      onClose={closeModal}
    />
  );
  if (modal === 'resourcePackBrowser') return (
    <ResourcePackBrowserModal
      instanceId={modalData?.instanceId}
      onClose={closeModal}
    />
  );
  if (modal === 'shaderPackBrowser') return (
    <ShaderPackBrowserModal
      instanceId={modalData?.instanceId}
      onClose={closeModal}
    />
  );
  if (modal === 'download')    return (
    <DownloadOverlay
      versionId={modalData?.versionId}
      instanceName={modalData?.instanceName}
      instanceId={modalData?.instanceId}
      onDone={(launcherDir, versionData, loaderVersion) => {
        dispatch({ type: 'UPDATE_INSTANCE', payload: {
          id: modalData?.instanceId,
          installed: true,
          launcherDir,
          loaderVersion,
        }});
        closeModal();
      }}
      onCancel={closeModal}
    />
  );
  return null;
}

function JavaDownloadOverlay() {
  const { state } = useStore();
  const { javaDownload } = state;
  if (!javaDownload) return null;

  const PHASE_ICONS = { fetch: '🔍', download: '⬇️', extract: '📦' };
  const icon = PHASE_ICONS[javaDownload.phase] ?? '☕';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 32, width: 420,
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <span style={{ fontSize: 28 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Instalando Java {javaDownload.requiredMajor}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Requerido por esta versión de Minecraft
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)',
          height: 6, overflow: 'hidden', marginBottom: 10,
        }}>
          <div style={{
            height: '100%', background: 'var(--accent)',
            width: `${javaDownload.percent ?? 0}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{javaDownload.label}</span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {Math.round(javaDownload.percent ?? 0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Aplica tema y accent color al document siempre que cambie la config
function useThemeSync() {
  const { state } = useStore();
  const { theme, accentColor } = state.config;

  useEffect(() => {
    // Aplicar tema
    const resolvedTheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (theme ?? 'dark');
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [theme]);

  useEffect(() => {
    if (accentColor && /^#[0-9A-F]{6}$/i.test(accentColor)) {
      const r = parseInt(accentColor.slice(1, 3), 16);
      const g = parseInt(accentColor.slice(3, 5), 16);
      const b = parseInt(accentColor.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent', accentColor);
      document.documentElement.style.setProperty('--accent-dim', accentColor);
      document.documentElement.style.setProperty('--text-accent', accentColor);
      document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.15)`);
      document.documentElement.style.setProperty('--accent-glow-strong', `rgba(${r},${g},${b},0.35)`);
      document.documentElement.style.setProperty('--border-accent', `rgba(${r},${g},${b},0.3)`);
      document.documentElement.style.setProperty('--shadow-accent', `0 0 20px rgba(${r},${g},${b},0.2)`);
    }
  }, [accentColor]);
}

function AppShell() {
  const { state } = useStore();
  useGameLauncher();
  useInstancePersistence();
  useThemeSync();

  if (state.showSetupWizard) {
    return <SetupWizard />;
  }

  return (
    <div className="app-layout">
      <TitleBar />
      <Sidebar />
      <MainPanel />
      <Modals />
      <ErrorModal />
      <JavaDownloadOverlay />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
