import { useState, useEffect, useCallback, useRef } from 'react';
import { searchModpacks as searchModrinthPacks } from '../lib/api/modrinth';
import { searchModpacks as searchCurseforgePacks, isCurseForgeConfigured } from '../lib/api/curseforge-modpacks';
import { POPULAR_VERSIONS } from '../lib/instances';
import Select from './ui/Select';
import ModpackInstallModal from './ModpackInstallModal';
import './ModpackBrowser.css';

const LOADERS_MODPACK = ['fabric', 'forge', 'quilt', 'neoforge'];
const LIMIT = 20;

// ─── Modpack card unificada (Modrinth o CurseForge) ──────────────────────────
function ModpackCard({ source, pack, onClick }) {
  const display = source === 'curseforge'
    ? {
        title:    pack.name,
        author:   pack.authors?.[0]?.name ?? '',
        desc:     pack.summary,
        icon:     pack.logo?.url,
        downloads: pack.downloadCount,
        loaders:  inferLoadersFromCurseforge(pack),
      }
    : {
        title:    pack.title,
        author:   pack.author,
        desc:     pack.description,
        icon:     pack.icon_url,
        downloads: pack.downloads,
        loaders:  (pack.categories ?? []).filter(c => LOADERS_MODPACK.includes(c.toLowerCase())),
      };

  return (
    <button className="mpbrowser-card" onClick={onClick}>
      {display.icon && (
        <img
          className="mpbrowser-card-icon"
          src={display.icon}
          alt={display.title}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="mpbrowser-card-body">
        <div className="mpbrowser-card-title">{display.title}</div>
        <div className="mpbrowser-card-author">por {display.author || '—'}</div>
        <div className="mpbrowser-card-desc">{display.desc}</div>
        <div className="mpbrowser-card-meta">
          <span>⬇ {(display.downloads ?? 0).toLocaleString()}</span>
        </div>
        {display.loaders?.length > 0 && (
          <div className="mpbrowser-card-tags">
            {display.loaders.map(tag => (
              <span key={tag} className={`mpbrowser-tag mpbrowser-tag-${tag.toLowerCase()}`}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function inferLoadersFromCurseforge(pack) {
  // CurseForge: las categorías incluyen IDs de loaders, no nombres. Lo más confiable
  // es inferir del último file featured si está disponible.
  const featured = pack.latestFiles?.[0]?.gameVersions ?? [];
  return featured.filter(v => LOADERS_MODPACK.includes(v.toLowerCase()));
}

// ─── Main browser ────────────────────────────────────────────────────────────
export default function ModpackBrowser() {
  const [source,        setSource]        = useState('modrinth');  // 'modrinth' | 'curseforge'
  const [query,         setQuery]         = useState('');
  const [results,       setResults]       = useState([]);
  const [total,         setTotal]         = useState(0);
  const [offset,        setOffset]        = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [filterVersion, setFilterVersion] = useState('');
  const [filterLoader,  setFilterLoader]  = useState('');
  const [installPack,   setInstallPack]   = useState(null);

  const debounceRef = useRef(null);

  const doSearch = useCallback(async (src, q, version, loader, off = 0) => {
    setLoading(true);
    try {
      let data;
      if (src === 'modrinth') {
        data = await searchModrinthPacks({
          query: q,
          gameVersion: version || undefined,
          loader: loader || undefined,
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(data.hits);
        else setResults(prev => [...prev, ...data.hits]);
        setTotal(data.total_hits);
      } else {
        // CurseForge
        const r = await searchCurseforgePacks(q || ' ', {
          gameVersion: version || undefined,
          limit: LIMIT,
        });
        if (off === 0) setResults(r.data || []);
        else setResults(prev => [...prev, ...(r.data || [])]);
        setTotal(r.pagination?.totalCount ?? (r.data?.length ?? 0));
      }
      setOffset(off);
    } catch (err) {
      console.error('[ModpackBrowser] Error buscando:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search inicial al cambiar de fuente o filtros
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(source, query, filterVersion, filterLoader, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [source, query, filterVersion, filterLoader, doSearch]);

  const loadMore = () => doSearch(source, query, filterVersion, filterLoader, offset + LIMIT);

  return (
    <div className="mpbrowser">
      {/* Header con tabs de fuente */}
      <div className="mpbrowser-header">
        <h1 className="mpbrowser-title">📦 Modpacks</h1>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            className={`btn btn-sm ${source === 'modrinth' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSource('modrinth')}
          >
            Modrinth
          </button>
          <button
            className={`btn btn-sm ${source === 'curseforge' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSource('curseforge')}
            title={!isCurseForgeConfigured() ? 'Requiere API key en .env' : ''}
          >
            CurseForge {!isCurseForgeConfigured() && '⚠️'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mpbrowser-filters">
        <input
          className="mpbrowser-search"
          placeholder={`Buscar modpacks en ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}…`}
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
        {source === 'modrinth' && (
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
        )}
      </div>

      {/* Grid (sin panel detalle) */}
      <div className="mpbrowser-body" style={{ display: 'block' }}>
        <div className="mpbrowser-list" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {loading && results.length === 0 ? (
            <div className="mpbrowser-loading">Buscando modpacks…</div>
          ) : results.length === 0 ? (
            <div className="mpbrowser-loading">No se encontraron modpacks</div>
          ) : (
            <>
              <div className="mpbrowser-count" style={{ gridColumn: '1 / -1' }}>
                {total.toLocaleString()} modpacks
              </div>
              {results.map(pack => (
                <ModpackCard
                  key={source === 'curseforge' ? pack.id : pack.project_id}
                  source={source}
                  pack={pack}
                  onClick={() => setInstallPack(pack)}
                />
              ))}
              {results.length < total && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ gridColumn: '1 / -1' }}
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Cargando…' : 'Cargar más'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de instalación */}
      {installPack && (
        <ModpackInstallModal
          source={source}
          pack={installPack}
          onClose={() => setInstallPack(null)}
        />
      )}
    </div>
  );
}
