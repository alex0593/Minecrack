import './MainPanel.css';
import { useStore } from '../store';
import SettingsPage from './SettingsPage';
import ModpackImportWizard from './ModpackImportWizard';
import InstanceDetail from './main-panel/InstanceDetail';
import WelcomeView from './main-panel/WelcomeView';

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
