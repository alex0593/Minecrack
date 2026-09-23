import './ModCard.css';

/** Tarjeta de mod en el grid del explorador de mods. */
export default function ModCard({ mod, selected, onClick, isInstalled }) {
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
