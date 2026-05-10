import { useState } from 'react';
import './Sidebar.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';
import { formatRelativeTime } from '../lib/format';
import ImportInstanceModal from './ImportInstanceModal';

export default function Sidebar() {
  const [showImportModal, setShowImportModal] = useState(false);
  const { state, dispatch, openModal } = useStore();
  const { instances, selectedInstanceId, activeTab, profile, profileReady, gameRunning, gameInstanceId } = state;

  const loaderLabel = (l) => LOADERS.find(x => x.id === l)?.label ?? 'Vanilla';

  const getInstanceStatus = (inst) => {
    if (gameRunning && gameInstanceId === inst.id) return 'running';
    if (!inst.installed) return 'pending';
    return 'ready';
  };

  const statusLabel = {
    running: 'Jugando',
    pending: 'Sin instalar',
    ready:   'Listo',
  };

  return (
    <aside className="sidebar">

      {/* Profile card */}
      <div className="sidebar-profile">
        <div
          id="profile-card"
          className="profile-card"
          onClick={() => openModal('profile')}
          title="Cambiar perfil"
        >
          <div className="profile-avatar">🎮</div>
          <div className="profile-info">
            <div className="profile-name">
              {profileReady ? profile.username : 'Sin perfil'}
            </div>
            <div className="profile-mode">
              <span>●</span> Modo Offline
            </div>
          </div>
          <span className="profile-edit-icon">✎</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">Menú</div>
        {[
          { id: 'instances', icon: '⊞', label: 'Instancias' },
          { id: 'mods',      icon: '📦', label: 'Modpacks' },
          { id: 'settings',  icon: '⚙', label: 'Configuración' },
        ].map(item => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            className={`sidebar-nav-item${activeTab === item.id ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TAB', payload: item.id })}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Instance list */}
      <div className="sidebar-instances-header">
        <span className="sidebar-instances-title">Instancias ({instances.length})</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            id="btn-import-instance-sidebar"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowImportModal(true)}
            title="Importar instancia desde carpeta o ZIP"
          >📥</button>
          <button
            id="btn-new-instance-sidebar"
            className="btn btn-primary btn-sm"
            onClick={() => openModal('newInstance')}
          >+ Nueva</button>
        </div>
      </div>

      <div className="sidebar-instances-list">
        {instances.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-illustration">📦</div>
            <h3 className="empty-state-title">Sin instancias</h3>
            <p className="empty-state-desc">
              Crea tu primera instancia para empezar a jugar Minecraft.
            </p>
            <div className="empty-state-actions">
              <button
                className="empty-state-cta empty-state-cta-primary"
                onClick={() => openModal('newInstance')}
              >+ Crear instancia</button>
            </div>
          </div>
        ) : (
          instances.map(inst => {
            const status = getInstanceStatus(inst);
            return (
              <div
                key={inst.id}
                id={`instance-${inst.id}`}
                className={`instance-card${selectedInstanceId === inst.id ? ' is-selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_INSTANCE', payload: inst.id })}
              >
                <div className="instance-card-icon">{inst.icon}</div>
                <div className="instance-card-body">
                  <div className="instance-card-name">{inst.name}</div>
                  <div className="instance-card-badges">
                    <span className="instance-card-badge instance-card-badge-mc">{inst.version}</span>
                    <span className={`instance-card-badge instance-card-badge-${inst.loader}`}>
                      {loaderLabel(inst.loader)}
                    </span>
                  </div>
                  <div className="instance-card-meta">
                    <span className="instance-card-meta-time">
                      {inst.lastPlayed
                        ? formatRelativeTime(inst.lastPlayed)
                        : 'No jugado'}
                    </span>
                    <span className={`status-pill status-pill-${status}`}>
                      <span className="dot" />
                      {statusLabel[status]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Import instance modal */}
      {showImportModal && (
        <ImportInstanceModal
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Bottom */}
      <div className="sidebar-bottom">
        <span className="sidebar-version">Minecrack v1.0.0</span>
      </div>

    </aside>
  );
}
