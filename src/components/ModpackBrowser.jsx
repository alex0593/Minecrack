import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store';
import { searchModpacks, getModpackVersions, getProject } from '../lib/api/modrinth';
import { POPULAR_VERSIONS } from '../lib/instances';
import Select from './ui/Select';
import './ModpackBrowser.css';

const LOADERS_MODPACK = ['fabric', 'forge', 'quilt', 'neoforge'];
const LIMIT = 20;

// ─── Modpack card in list ─────────────────────────────────────────────────────
function ModpackCard({ pack, selected, onClick }) {
  const loaderTags = (pack.categories ?? []).filter(c =>
    LOADERS_MODPACK.includes(c.toLowerCase())
  );

  return (
    <button
      className={`mpbrowser-card${selected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <img
        className="mpbrowser-card-icon"
        src={pack.icon_url || '/default-mod.png'}
        alt={pack.title}
        onError={e => { e.target.style.display = 'none'; }}
      />
      <div className="mpbrowser-card-body">
        <div className="mpbrowser-card-title">{pack.title}</div>
        <div className="mpbrowser-card-author">por {pack.author}</div>
        <div className="mpbrowser-card-desc">{pack.description}</div>
        <div className="mpbrowser-card-meta">
          <span>⬇ {(pack.downloads / 1000).toFixed(0)}k</span>
          <span>🔄 {new Date(pack.date_modified).toLocaleDateString()}</span>
        </div>
        {loaderTags.length > 0 && (
          <div className="mpbrowser-card-tags">
            {loaderTags.map(tag => (
              <span key={tag} className={`mpbrowser-tag mpbrowser-tag-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Modpack detail panel ─────────────────────────────────────────────────────
function ModpackDetail({ pack }) {
  const { openModal } = useStore();
  const [versions,    setVersions]    = useState([]);
  const [selectedVer, setSelectedVer] = useState(null);
  const [project,     setProject]     = useState(null);

  useEffect(() => {
    if (!pack) return;
    setVersions([]);
    setSelectedVer(null);
    setProject(null);

    // Load versions and project details in parallel
    Promise.all([
      getModpackVersions(pack.project_id).catch(() => []),
      getProject(pack.project_id).catch(() => null),
    ]).then(([vers, proj]) => {
      setVersions(vers);
      if (vers.length > 0) setSelectedVer(vers[0]);
      setProject(proj);
    });
  }, [pack?.project_id]);

  if (!pack) {
    return (
      <div className="mpbrowser-detail-empty">
        <div style={{ fontSize: 48 }}>📦</div>
        <p>Selecciona un modpack para ver los detalles</p>
      </div>
    );
  }

  // Derive mc version + loader from selected version
  const mcVersion  = selectedVer?.game_versions?.[0] ?? null;
  const loaderName = selectedVer?.loaders?.find(l => LOADERS_MODPACK.includes(l)) ?? null;

  const loaderTags = (pack.categories ?? []).filter(c =>
    LOADERS_MODPACK.includes(c.toLowerCase())
  );
  const allTags = (pack.categories ?? []).filter(c =>
    !LOADERS_MODPACK.includes(c.toLowerCase())
  );

  const handleInstall = () => {
    openModal('newInstance', {
      prefill: {
        name:    pack.title,
        version: mcVersion,
        loader:  loaderName ?? 'fabric',
      },
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mpbrowser-detail-header">
        {pack.icon_url && (
          <img
            src={pack.icon_url}
            alt={pack.title}
            className="mpbrowser-detail-icon"
          />
        )}
        <div>
          <h2>{pack.title}</h2>
          <div className="mpbrowser-detail-by">por {pack.author}</div>
          <div className="mpbrowser-detail-stats">
            <span>⬇ {pack.downloads?.toLocaleString()} descargas</span>
            <span>👥 {pack.follows?.toLocaleString()} seguidores</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="mpbrowser-detail-desc">{pack.description}</p>

      {/* Tags */}
      {(loaderTags.length > 0 || allTags.length > 0) && (
        <div className="mpbrowser-detail-tags">
          {loaderTags.map(t => (
            <span key={t} className={`mpbrowser-tag mpbrowser-tag-${t}`}>{t}</span>
          ))}
          {allTags.slice(0, 8).map(t => (
            <span key={t} className="mpbrowser-tag">{t}</span>
          ))}
        </div>
      )}

      {/* Version selector */}
      <div className="mpbrowser-detail-section">
        <label>Versión del modpack</label>
        {versions.length === 0 ? (
          <div className="mpbrowser-no-versions">
            Cargando versiones…
          </div>
        ) : (
          <Select
            size="sm"
            value={selectedVer?.id ?? ''}
            onChange={(id) => setSelectedVer(versions.find(v => v.id === id))}
            options={versions.map(v => ({
              value: v.id,
              label: `${v.name} (${v.game_versions?.[0] ?? '?'} · ${v.loaders?.join('/') ?? '?'})`,
            }))}
          />
        )}
      </div>

      {/* Version info */}
      {selectedVer && (
        <div className="mpbrowser-version-info">
          {mcVersion  && <span>🎮 MC {mcVersion}</span>}
          {loaderName && <span>🔧 {loaderName.charAt(0).toUpperCase() + loaderName.slice(1)}</span>}
          {selectedVer.files?.[0]?.size && (
            <span>📦 {(selectedVer.files[0].size / 1_048_576).toFixed(1)} MB</span>
          )}
        </div>
      )}

      {/* Install button */}
      <button
        className="btn btn-primary mpbrowser-install-btn"
        disabled={versions.length === 0 || !selectedVer}
        onClick={handleInstall}
      >
        ⬇ Crear instancia desde este modpack
      </button>
      <p className="mpbrowser-install-note">
        Se creará una instancia con MC {mcVersion ?? '?'} + {loaderName ?? 'loader'} preconfigurado.
        Luego podrás importar el .mrpack desde los ajustes de la instancia.
      </p>
    </div>
  );
}

// ─── Main browser ─────────────────────────────────────────────────────────────
export default function ModpackBrowser() {
  const [query,         setQuery]         = useState('');
  const [results,       setResults]       = useState([]);
  const [total,         setTotal]         = useState(0);
  const [offset,        setOffset]        = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [filterVersion, setFilterVersion] = useState('');
  const [filterLoader,  setFilterLoader]  = useState('');

  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q, version, loader, off = 0) => {
    setLoading(true);
    try {
      const data = await searchModpacks({
        query: q,
        gameVersion: version || undefined,
        loader: loader || undefined,
        limit: LIMIT,
        offset: off,
      });
      if (off === 0) setResults(data.hits);
      else setResults(prev => [...prev, ...data.hits]);
      setTotal(data.total_hits);
      setOffset(off);
    } catch (err) {
      console.error('[ModpackBrowser] Error buscando:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial search
  useEffect(() => { doSearch('', '', '', 0); }, []);

  // Debounce on query/filter change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, filterVersion, filterLoader, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, filterVersion, filterLoader]);

  const loadMore = () => doSearch(query, filterVersion, filterLoader, offset + LIMIT);

  return (
    <div className="mpbrowser">
      {/* Header */}
      <div className="mpbrowser-header">
        <h1 className="mpbrowser-title">📦 Modpacks — Modrinth</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Descubre y juega modpacks completos
        </span>
      </div>

      {/* Filters */}
      <div className="mpbrowser-filters">
        <input
          className="mpbrowser-search"
          placeholder="Buscar modpacks…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <input
          className="mpbrowser-filter-input"
          placeholder="Versión MC"
          value={filterVersion}
          onChange={e => setFilterVersion(e.target.value)}
          list="mp-versions-list"
        />
        <datalist id="mp-versions-list">
          {POPULAR_VERSIONS.map(v => <option key={v} value={v} />)}
        </datalist>
        <Select
          size="sm"
          value={filterLoader}
          onChange={setFilterLoader}
          placeholder="Todos los loaders"
          options={[
            { value: '', label: 'Todos los loaders' },
            ...LOADERS_MODPACK.map(l => ({
              value: l,
              label: l.charAt(0).toUpperCase() + l.slice(1),
            })),
          ]}
        />
      </div>

      {/* Body */}
      <div className="mpbrowser-body">
        {/* List */}
        <div className="mpbrowser-list">
          {loading && results.length === 0 ? (
            <div className="mpbrowser-loading">Buscando modpacks…</div>
          ) : results.length === 0 ? (
            <div className="mpbrowser-loading">No se encontraron modpacks</div>
          ) : (
            <>
              <div className="mpbrowser-count">
                {total.toLocaleString()} modpacks
              </div>
              {results.map(pack => (
                <ModpackCard
                  key={pack.project_id}
                  pack={pack}
                  selected={selected?.project_id === pack.project_id}
                  onClick={() => setSelected(pack)}
                />
              ))}
              {results.length < total && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Cargando…' : 'Cargar más'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Detail */}
        <div className="mpbrowser-detail-panel">
          <ModpackDetail pack={selected} />
        </div>
      </div>
    </div>
  );
}
