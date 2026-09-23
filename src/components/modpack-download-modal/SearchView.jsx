/**
 * SearchView.jsx — Vista de búsqueda del modal de descarga de modpacks
 *
 * Cubre los pasos 'search', 'loading' y 'selecting': formulario de
 * búsqueda, grid de resultados y estados vacío/cargando.
 */

import { isCurseForgeConfigured } from '../../lib/api/curseforge-modpacks';
import ModpackGridCard from './ModpackGridCard';
import './SearchView.css';

export default function SearchView({
  onClose,
  searchQuery,
  setSearchQuery,
  gameVersion,
  setGameVersion,
  loading,
  modpacks,
  handleSearch,
  handleSelectModpack,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modpack-download-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>⬇️ Descargar modpack desde CurseForge</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {!isCurseForgeConfigured() && (
            <div
              style={{
                backgroundColor: 'var(--bg-warning)',
                border: '1px solid var(--text-warning)',
                padding: 12,
                borderRadius: 4,
                marginBottom: 16,
                fontSize: 12,
                color: 'var(--text-warning)',
              }}
            >
              ⚠️ CurseForge API no está configurada. Necesitas una API key gratuita en .env
            </div>
          )}

          <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Buscar modpack
              </label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Create, All The Mods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                style={{ marginBottom: 8 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Versión Minecraft (opcional)
              </label>
              <select
                className="input"
                value={gameVersion}
                onChange={(e) => setGameVersion(e.target.value)}
                disabled={loading}
              >
                <option value="">Cualquier versión</option>
                <option value="1.21">1.21</option>
                <option value="1.20.1">1.20.1</option>
                <option value="1.20">1.20</option>
                <option value="1.19.2">1.19.2</option>
                <option value="1.18">1.18</option>
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!searchQuery.trim() || loading}
              style={{ width: '100%' }}
            >
              {loading ? '🔄 Buscando...' : '🔍 Buscar'}
            </button>
          </form>

          {modpacks.length > 0 && (
            <div className="modpack-list">
              {modpacks.map((modpack) => (
                <ModpackGridCard
                  key={modpack.id}
                  modpack={modpack}
                  loading={loading}
                  handleSelectModpack={handleSelectModpack}
                />
              ))}
            </div>
          )}

          {modpacks.length === 0 && !loading && searchQuery && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              <p>No se encontraron resultados</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>
                Intenta con otro término de búsqueda
              </p>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p>🔄 Buscando modpacks...</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
