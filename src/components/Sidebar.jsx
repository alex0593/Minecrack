import './Sidebar.css';
import { useStore } from '../store';
import { LOADERS } from '../lib/instances';

export default function Sidebar() {
  const { state, dispatch, openModal } = useStore();
  const { instances, selectedInstanceId, activeTab, profile, profileReady } = state;

  const loaderLabel = (l) => LOADERS.find(x => x.id === l)?.label ?? 'Vanilla';
  const loaderColor = (l) => LOADERS.find(x => x.id === l)?.color ?? 'badge-green';

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
          { id: 'mods',      icon: '⚙', label: 'Mods' },
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
        <button
          id="btn-new-instance-sidebar"
          className="btn btn-primary btn-sm"
          onClick={() => openModal('newInstance')}
        >+ Nueva</button>
      </div>

      <div className="sidebar-instances-list">
        {instances.length === 0 ? (
          <div className="sidebar-empty">
            <div className="sidebar-empty-icon">📦</div>
            <p className="sidebar-empty-text">
              No hay instancias.<br />Crea una para empezar.
            </p>
          </div>
        ) : (
          instances.map(inst => (
            <div
              key={inst.id}
              id={`instance-${inst.id}`}
              className={`instance-item${selectedInstanceId === inst.id ? ' selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_INSTANCE', payload: inst.id })}
            >
              <div className="instance-icon">{inst.icon}</div>
              <div className="instance-item-info">
                <div className="instance-item-name">{inst.name}</div>
                <div className="instance-item-meta">
                  {inst.version} · {loaderLabel(inst.loader)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <span className="sidebar-version">Minecrack v1.0.0</span>
      </div>

    </aside>
  );
}
