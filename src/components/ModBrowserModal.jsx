import { useState, useEffect, useCallback, useRef } from 'react';
import { useStoreState } from '../store';
import { searchMods, searchModpacks, getVersion } from '../lib/api/modrinth';
import { searchMods as searchModsCF, searchModpacks as searchModpacksCF, isCurseForgeConfigured } from '../lib/api/curseforge';
import { importInstanceFromZip, getModsToDownload } from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import { LOADERS } from '../lib/instances';
import Select from './ui/Select';
import ModCard from './mod-browser-modal/ModCard';
import ModDetail from './mod-browser-modal/ModDetail';
import './ModBrowserModal.css';

const LOADERS_MODRINTH = ['fabric', 'forge', 'quilt', 'neoforge'];

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ModBrowserModal({ instanceId, onClose }) {
  const state    = useStoreState();
  const instance = state.instances.find(i => i.id === instanceId);

  // Guard: Vanilla no soporta mods. Vive en un componente aparte para que el
  // número de hooks del explorador no varíe entre renders (rules of hooks):
  // antes, montar el guard con 1 hook y pasar al explorador con 13+ lanzaba
  // "Rendered more/fewer hooks than expected".
  if (instance?.loader === 'vanilla') {
    return <ModBrowserVanillaGuard onClose={onClose} />;
  }
  return <ModBrowserContent instanceId={instanceId} onClose={onClose} />;
}

/** ModBrowserVanillaGuard — aviso «Vanilla no soporta mods» con cierre */
function ModBrowserVanillaGuard({ onClose }) {
  return (
    <div className="modbrowser-overlay" onClick={onClose}>
      <div className="modbrowser-modal modal modal--sm" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto' }}>
        <div className="modbrowser-header">
          <h2>📦 Explorar Mods</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Vanilla no soporta mods</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Para instalar mods necesitas cambiar el loader de la instancia a
            <strong> Fabric</strong>, <strong>Forge</strong>, <strong>Quilt</strong> o <strong>NeoForge</strong>.
          </p>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Explorador completo (montar solo con loader que soporte mods) ───────────
function ModBrowserContent({ instanceId, onClose }) {
  const state    = useStoreState();
  const instance = state.instances.find(i => i.id === instanceId);

  // IDs de mods ya instalados para mostrar badge "Instalado"
  const installedIds = (state.instanceMods ?? []).map(m => m.id ?? m.slug ?? m.filename);

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterSource, setFilterSource] = useState('modrinth');
  const [filterType, setFilterType] = useState('mods'); // 'mods' | 'modpacks'

  const [filterVersion, setFilterVersion] = useState(instance?.version ?? '');
  const [filterLoader,  setFilterLoader]  = useState(
    instance?.loader && instance.loader !== 'vanilla' ? instance.loader : ''
  );

  const debounceRef = useRef(null);
  const LIMIT = 20;

  const doSearch = useCallback(async (q, version, loader, source, type, off = 0) => {
    setLoading(true);
    setError(null);
    // Aviso temprano si CurseForge está seleccionado pero no configurado
    if (source === 'curseforge' && !isCurseForgeConfigured()) {
      setResults([]);
      setLoading(false);
      setError('La API de CurseForge no está configurada. Añade una API key válida en VITE_CURSEFORGE_API_KEY (.env) y reinicia la app.');
      return;
    }
    try {
      let data;
      if (source === 'modrinth') {
        if (type === 'mods') {
          data = await searchMods({
            query: q,
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        } else {
          data = await searchModpacks({
            query: q,
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        }
        if (off === 0) setResults(data?.hits || []);
        else setResults(prev => [...prev, ...(data?.hits || [])]);
        setTotal(data?.total_hits || 0);
      } else if (source === 'curseforge') {
        if (type === 'mods') {
          data = await searchModsCF(q, {
            gameVersion: version || undefined,
            loader: loader || undefined,
            limit: LIMIT,
            offset: off,
          });
        } else {
          data = await searchModpacksCF(q, {
            gameVersion: version || undefined,
            limit: LIMIT,
            offset: off,
          });
        }
        if (off === 0) setResults(data?.data || []);
        else setResults(prev => [...prev, ...(data?.data || [])]);
        setTotal(data?.pagination?.totalCount || 0);
      }
      setOffset(off);
    } catch (err) {
      console.error('[ModBrowser] Error buscando:', err);
      if (off === 0) setResults([]);
      const srcName = source === 'curseforge' ? 'CurseForge' : 'Modrinth';
      setError(`Error al cargar desde ${srcName}: ${err?.message || err}. Revisa tu conexión y, si usas CurseForge, que la API key sea válida.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Búsqueda inicial
  useEffect(() => { doSearch(query, filterVersion, filterLoader, filterSource, filterType, 0); }, []);

  // Debounce en query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, filterVersion, filterLoader, filterSource, filterType, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, filterVersion, filterLoader, filterSource, filterType]);

  const loadMore = () => doSearch(query, filterVersion, filterLoader, filterType, offset + LIMIT);

  return (
    <div className="modbrowser-overlay" onClick={onClose}>
      <div className="modbrowser-modal modal modal--xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modbrowser-header">
          <h2>🔍 {filterType === 'mods' ? 'Explorar Mods' : 'Explorar Modpacks'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Filtros */}
        <div className="modbrowser-filters">
          <input
            className="modbrowser-search"
            placeholder={filterType === 'mods' ? 'Buscar mods...' : 'Buscar modpacks...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <Select
            size="sm"
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'mods', label: 'Mods' },
              { value: 'modpacks', label: 'Modpacks' },
            ]}
          />
          <Select
            size="sm"
            value={filterSource}
            onChange={setFilterSource}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              ...(isCurseForgeConfigured() ? [{ value: 'curseforge', label: 'CurseForge' }] : []),
            ]}
          />
          <input
            className="modbrowser-filter-input"
            placeholder="Versión MC"
            value={filterVersion}
            onChange={e => setFilterVersion(e.target.value)}
          />
          <Select
            size="sm"
            value={filterLoader}
            onChange={setFilterLoader}
            placeholder="Todos los loaders"
            options={[
              { value: '', label: 'Todos los loaders' },
              ...LOADERS_MODRINTH.map(l => ({
                value: l,
                label: l.charAt(0).toUpperCase() + l.slice(1),
              })),
            ]}
          />
        </div>

        {/* Cuerpo */}
        <div className="modbrowser-body">

          {/* Lista */}
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
                    onClick={() => setSelected(mod)}
                    isInstalled={installedIds.some(id => id === mod.project_id || id === mod.slug)}
                  />
                ))}
                {results.length < total && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', marginTop: 8 }}
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'Cargando...' : 'Cargar más'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Detalle */}
          <div className="modbrowser-detail-panel">
            <ModDetail
              mod={selected}
              instance={instance}
              isModpack={filterType === 'modpacks'}
              filterSource={filterSource}
              onInstalled={() => setSelected(null)}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
