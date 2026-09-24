import { useState, useEffect, useCallback, useRef } from 'react';
import { useStoreState } from '../store';
import { searchMods, searchModpacks, getVersion } from '../lib/api/modrinth';
import { searchMods as searchModsCF, searchModpacks as searchModpacksCF, isCurseForgeConfigured } from '../lib/api/curseforge';
import { importInstanceFromZip, getModsToDownload } from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import { LOADERS } from '../lib/instances';
import ModDetail from './mod-browser-modal/ModDetail';
import FilterBar from './mod-browser-modal/FilterBar';
import ModResultsList from './mod-browser-modal/ModResultsList';
import VanillaGuard from './mod-browser-modal/VanillaGuard';
import Modal from './ui/Modal';
import './ModBrowserModal.css';

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ModBrowserModal({ instanceId, onClose }) {
  const state    = useStoreState();
  const instance = state.instances.find(i => i.id === instanceId);

  // Guard: Vanilla no soporta mods. Vive en un componente aparte para que el
  // número de hooks del explorador no varíe entre renders (rules of hooks):
  // antes, montar el guard con 1 hook y pasar al explorador con 13+ lanzaba
  // "Rendered more/fewer hooks than expected".
  if (instance?.loader === 'vanilla') {
    return <VanillaGuard onClose={onClose} />;
  }
  return <ModBrowserContent instanceId={instanceId} onClose={onClose} />;
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

  // Hallazgo 7: antes pasaba `filterType` como `source` y el offset como `type`
  const loadMore = () => doSearch(query, filterVersion, filterLoader, filterSource, filterType, offset + LIMIT);

  return (
    <Modal
      open
      onClose={onClose}
      title={filterType === 'mods' ? 'Explorar Mods' : 'Explorar Modpacks'}
      icon="🔍"
      size="xl"
      contentClassName="modbrowser-modal"
    >
      {/* Filtros */}
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterSource={filterSource}
        onFilterSourceChange={setFilterSource}
        filterVersion={filterVersion}
        onFilterVersionChange={setFilterVersion}
        filterLoader={filterLoader}
        onFilterLoaderChange={setFilterLoader}
      />

      {/* Cuerpo */}
      <div className="modbrowser-body">

        {/* Lista */}
        <ModResultsList
          loading={loading}
          error={error}
          results={results}
          total={total}
          selected={selected}
          onSelect={setSelected}
          installedIds={installedIds}
          onLoadMore={loadMore}
        />

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
    </Modal>
  );
}
