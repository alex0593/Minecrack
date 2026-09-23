/** ModResultsList — lista de resultados del explorador (estados vacíos y «Cargar más») */
import ModCard from './ModCard';
import './ModResultsList.css';

export default function ModResultsList({
  loading,
  error,
  results,
  total,
  selected,
  onSelect,
  installedIds,
  onLoadMore,
}) {
  return (
    <div className="modbrowser-list">
      {loading && results.length === 0 ? (
        <div className="modbrowser-loading">Buscando...</div>
      ) : error ? (
        <div className="modbrowser-loading" style={{ color: 'var(--red)', textAlign: 'center', padding: '24px 16px', lineHeight: 1.5 }}>
          ⚠️ {error}
        </div>
      ) : results.length === 0 ? (
        <div className="modbrowser-loading">No se encontraron mods</div>
      ) : (
        <>
          <div className="modbrowser-count">
            {total.toLocaleString()} resultados
          </div>
          {results.map(mod => (
            <ModCard
              key={mod.project_id}
              mod={mod}
              selected={selected?.project_id === mod.project_id}
              onClick={() => onSelect(mod)}
              isInstalled={installedIds.some(id => id === mod.project_id || id === mod.slug)}
            />
          ))}
          {results.length < total && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', marginTop: 8 }}
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? 'Cargando...' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
