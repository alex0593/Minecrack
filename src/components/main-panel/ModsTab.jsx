import { useState } from 'react';
import './ModsTab.css';
import { useStore } from '../../store';
import {
  listMods, deleteMod, toggleMod, getLauncherDir, exportInstanceMods, ensureDir,
} from '../../lib/tauri';
import ImportModsModal from '../ImportModsModal';

/* ─── Helpers ─────────────────────────────────── */
const fmtModVersion = (v) =>
  !v || v === 'unknown' || v === 'N/A' || v.includes('${') ? null : v;

const fmtModName = (name, version) => {
  const ver = fmtModVersion(version);
  return ver ? `${name} v${ver}` : name;
};

/** ModsTab — pestaña de mods instalados de la instancia (búsqueda, vistas, export/import) */
export default function ModsTab({ instance }) {
  const { state, dispatch, openModal } = useStore();
  const mods = state.instanceMods ?? [];
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [expandedMod, setExpandedMod] = useState(null); // filename del mod expandido
  const [searchQuery, setSearchQuery] = useState('');

  // View mode: 'grid' | 'list' | 'compact' — persisted in localStorage
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('minecrack.modsViewMode') || 'grid'; }
    catch { return 'grid'; }
  });

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null); // { count, size, path } o null

  const changeViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('minecrack.modsViewMode', mode); } catch {}
  };

  // Filtrar mods por búsqueda
  const q = searchQuery.trim().toLowerCase();
  const filteredMods = q
    ? mods.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.filename.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      )
    : mods;

  const handleDelete = async (filename) => {
    try {
      const launcherDir = await getLauncherDir();
      await deleteMod(launcherDir, instance.id, filename);
      const updated = await listMods(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
    } catch (err) {
      console.error('[ModsTab] Error eliminando mod:', err);
    }
  };

  const handleToggle = async (filename, currentEnabled) => {
    try {
      const launcherDir = await getLauncherDir();
      await toggleMod(launcherDir, instance.id, filename, !currentEnabled);
      const updated = await listMods(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
    } catch (err) {
      console.error('[ModsTab] Error cambiando estado del mod:', err);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportSuccess(null);
      const launcherDir = await getLauncherDir();
      const exportsDir = `${launcherDir}/exports`;
      const zipPath = `${exportsDir}/${instance.name}-mods.zip`;

      // Crear directorio de exports
      await ensureDir(exportsDir);

      const result = await exportInstanceMods(launcherDir, instance.id, zipPath);
      const sizeMB = (result.size_bytes / (1024 * 1024)).toFixed(2);

      setExportSuccess({
        count: result.mod_count,
        size: sizeMB,
        path: zipPath,
        filename: `${instance.name}-mods.zip`,
      });

      // Auto-hide notification after 4 seconds
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      console.error('[ModsTab] Error exportando mods:', err);
      // Could show error notification here too
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mods-header">
        <h3>
          Mods instalados
          {' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            ({q ? `${filteredMods.length}/${mods.length}` : mods.length})
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View mode toggle */}
          <div className="mods-view-toggle">
            <button
              className={`mods-view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => changeViewMode('grid')}
              title="Vista en cuadrícula"
            >⊞</button>
            <button
              className={`mods-view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => changeViewMode('list')}
              title="Vista en lista"
            >≡</button>
            <button
              className={`mods-view-btn${viewMode === 'compact' ? ' active' : ''}`}
              onClick={() => changeViewMode('compact')}
              title="Vista compacta"
            >·</button>
          </div>

          <button
            id="btn-add-mod"
            className="btn btn-primary btn-sm"
            onClick={() => openModal('modBrowser', { instanceId: instance.id })}
            disabled={loading}
          >
            + Añadir mod
          </button>
          <button
            id="btn-export-mods"
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={loading || exporting || mods.length === 0}
            title="Exportar mods como ZIP"
          >
            {exporting ? '⏳ Exportando...' : '📦 Exportar'}
          </button>
          <button
            id="btn-import-mods"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowImportModal(true)}
            disabled={loading}
            title="Importar mods desde ZIP"
          >
            📥 Importar
          </button>
        </div>
      </div>

      {showImportModal && (
        <ImportModsModal
          instanceId={instance.id}
          onClose={() => {
            setShowImportModal(false);
            // Recargar mods después de cerrar
            const loadMods = async () => {
              try {
                const launcherDir = await getLauncherDir();
                const updated = await listMods(launcherDir, instance.id);
                dispatch({ type: 'SET_INSTANCE_MODS', payload: updated });
              } catch (err) {
                console.error('[ModsTab] Error recargando mods:', err);
              }
            };
            loadMods();
          }}
        />
      )}

      {/* Barra de búsqueda */}
      {mods.length > 0 && (
        <div className="mods-search-bar">
          <input
            type="search"
            className="mods-search-input"
            placeholder="🔍 Buscar mod..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="mods-search-clear"
              onClick={() => setSearchQuery('')}
              title="Limpiar búsqueda"
            >✕</button>
          )}
        </div>
      )}

      {/* Export success notification */}
      {exportSuccess && (
        <div className="export-notification">
          <div className="export-notification-content">
            <div className="export-notification-icon">✓</div>
            <div className="export-notification-text">
              <div className="export-notification-title">Exportado: {exportSuccess.filename}</div>
              <div className="export-notification-details">
                {exportSuccess.count} mod(s) • {exportSuccess.size} MB
              </div>
            </div>
          </div>
        </div>
      )}

      {mods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">🧩</div>
          <h3 className="empty-state-title">Sin mods instalados</h3>
          <p className="empty-state-desc">
            Agrega mods desde el catálogo de Modrinth/CurseForge o importa un ZIP existente.
          </p>
          <div className="empty-state-actions">
            <button
              className="empty-state-cta empty-state-cta-primary"
              onClick={() => openModal('modBrowser', { instanceId: instance.id })}
            >🔍 Explorar mods</button>
            <button
              className="empty-state-cta"
              onClick={() => setShowImportModal(true)}
            >📥 Importar ZIP</button>
          </div>
        </div>
      ) : filteredMods.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="empty-state-illustration" style={{ fontSize: 32 }}>🔍</div>
          <h3 className="empty-state-title" style={{ fontSize: 15 }}>Sin resultados para "{searchQuery}"</h3>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setSearchQuery('')}>
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className={
          viewMode === 'grid'    ? 'mods-grid'
          : viewMode === 'list'  ? 'mods-list'
          : 'mods-compact'
        }>
          {filteredMods.map(mod => {
            const isExpanded = expandedMod === mod.filename;

            if (viewMode === 'compact') {
              return (
                <div key={mod.filename}>
                  <div
                    className={`mod-row-compact${!mod.enabled ? ' disabled' : ''}`}
                    onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                    style={{ cursor: 'pointer' }}
                  >
                    {mod.iconBase64
                      ? <img src={mod.iconBase64} alt="" className="mod-compact-icon" />
                      : <span className={`mod-compact-dot${!mod.enabled ? ' off' : ''}`} />
                    }
                    <span className="mod-compact-name">{fmtModName(mod.name, mod.version)}</span>
                    <div className="mod-compact-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                        {mod.enabled ? '🔒' : '🔓'}
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                    </div>
                  </div>
                  {isExpanded && mod.description && (
                    <div className="mod-description-panel">{mod.description}</div>
                  )}
                  {isExpanded && !mod.description && (
                    <div className="mod-description-panel mod-description-empty">Sin descripción disponible</div>
                  )}
                </div>
              );
            }

            if (viewMode === 'list') {
              return (
                <div key={mod.filename}>
                  <div
                    className={`mod-row${!mod.enabled ? ' disabled' : ''}`}
                    onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="mod-row-icon">
                      {mod.iconBase64
                        ? <img src={mod.iconBase64} alt="" className="mod-icon-img" />
                        : (mod.enabled ? '🧩' : '⊘')
                      }
                    </div>
                    <div className="mod-row-info">
                      <div className="mod-row-name">{fmtModName(mod.name, mod.version)}</div>
                    </div>
                    <div className="mod-row-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                        {mod.enabled ? '🔒' : '🔓'}
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className={`mod-description-panel${!mod.description ? ' mod-description-empty' : ''}`}>
                      {mod.description || 'Sin descripción disponible'}
                    </div>
                  )}
                </div>
              );
            }

            // Default: grid
            return (
              <div
                key={mod.filename}
                className={`mod-card${!mod.enabled ? ' disabled' : ''}${isExpanded ? ' expanded' : ''}`}
                onClick={() => setExpandedMod(isExpanded ? null : mod.filename)}
                style={{ cursor: 'pointer' }}
              >
                <div className="mod-icon-box">
                  {mod.iconBase64
                    ? <img src={mod.iconBase64} alt="" className="mod-icon-img" />
                    : (mod.enabled ? '🧩' : '⊘')
                  }
                </div>
                <div className="mod-info">
                  <div className="mod-name">{fmtModName(mod.name, mod.version)}</div>
                  {isExpanded && (
                    <div className="mod-expanded-desc">
                      {mod.description || 'Sin descripción disponible'}
                    </div>
                  )}
                  <div className="mod-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mod.filename, mod.enabled)}>
                      {mod.enabled ? '🔒' : '🔓'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(mod.filename)}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
