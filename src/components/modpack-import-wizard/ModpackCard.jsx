/** ModpackCard — Tarjeta de un modpack en la cuadrícula de resultados */

import './ModpackCard.css';

export default function ModpackCard({ source, pack, onClick, isSelected }) {
  const display = source === 'curseforge'
    ? {
        title: pack.name,
        author: pack.authors?.[0]?.name ?? '',
        desc: pack.summary,
        icon: pack.logo?.url,
        downloads: pack.downloadCount,
      }
    : {
        title: pack.title,
        author: pack.author,
        desc: pack.description,
        icon: pack.icon_url,
        downloads: pack.downloads,
      };

  return (
    <button
      className={`wizard-modpack-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {display.icon && (
        <img
          className="wizard-card-icon"
          src={display.icon}
          alt={display.title}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="wizard-card-body">
        <div className="wizard-card-title">{display.title}</div>
        <div className="wizard-card-author">by {display.author || '—'}</div>
        <div className="wizard-card-desc">{display.desc}</div>
        <div className="wizard-card-meta">⬇ {(display.downloads ?? 0).toLocaleString()}</div>
      </div>
    </button>
  );
}
