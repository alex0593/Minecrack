/**
 * ModpackGridCard.jsx — Tarjeta de un modpack en el grid de resultados
 *
 * Se renderiza dentro de SearchView para cada resultado de la búsqueda.
 */

export default function ModpackGridCard({ modpack, loading, handleSelectModpack }) {
  return (
    <button
      key={modpack.id}
      className="modpack-card"
      onClick={() => handleSelectModpack(modpack)}
      disabled={loading}
    >
      {modpack.logo && (
        <img
          src={modpack.logo.url}
          alt={modpack.name}
          className="modpack-card-logo"
        />
      )}
      <div className="modpack-card-content">
        <div className="modpack-card-name">{modpack.name}</div>
        <div className="modpack-card-summary">{modpack.summary}</div>
        <div className="modpack-card-meta">
          ⬇️ {formatNumber(modpack.downloadCount || 0)}
        </div>
      </div>
    </button>
  );
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
