import { useState, useEffect, useCallback, useRef } from 'react';
import { useStoreState, useDispatch } from '../store';
import { searchResourcePacks as searchModrinthPacks, getProjectVersions, getProject } from '../lib/api/modrinth';
import { searchResourcePacks as searchCFPacks, getMod, getModFiles } from '../lib/api/curseforge';
import { downloadResourcePack, getLauncherDir, listResourcePacks, tauriListen } from '../lib/tauri';
import { getFile as getCFFile, extractSha1 } from '../lib/api/curseforge';
import Select from './ui/Select';
import './PackBrowserModal.css';

function PackCard({ pack, selected, onClick }) {
  const icon = pack.icon_url || pack.logo?.url || '/default-mod.png';

  return (
    <button
      className={`packbrowser-card${selected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <img
        className="packbrowser-card-icon"
        src={icon}
        alt={pack.title || pack.name}
        onError={e => { e.target.style.display = 'none'; }}
      />
      <div className="packbrowser-card-info">
        <div className="packbrowser-card-title">{pack.title || pack.name}</div>
        <div className="packbrowser-card-desc">{pack.description || pack.summary || 'Sin descripción'}</div>
        <div className="packbrowser-card-meta">
          <span>⬇ {((pack.downloads || pack.downloadCount || 0) / 1000).toFixed(0)}k</span>
        </div>
      </div>
    </button>
  );
}

function PackDetail({ pack, instance, source, onInstalled }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(null);
  const { dispatch } = useDispatch();

  const handleInstall = async () => {
    setInstalling(true);
    setProgress({ label: 'Preparando...', percent: 0 });

    const unlisten = await tauriListen('download://progress', (payload) => {
      if (payload.total > 0) {
        setProgress({
          label: payload.file,
          percent: Math.round((payload.received / payload.total) * 100),
        });
      }
    });

    try {
      const launcherDir = await getLauncherDir();

      // Determinar URL de descarga basado en source
      let downloadUrl, fileName, sha1 = null;

      if (source === 'modrinth') {
        // Buscar versiones compatibles con la versión MC de la instancia
        let versions = await getProjectVersions(pack.project_id, {
          gameVersion: instance?.version,
        });
        // Fallback: si no hay versiones para esa MC, obtener la más reciente sin filtro
        if (!versions || versions.length === 0) {
          versions = await getProjectVersions(pack.project_id, {});
        }
        if (!versions || versions.length === 0) throw new Error('No se encontraron versiones para este resource pack');
        const latestVersion = versions[0];
        const primaryFile = latestVersion.files?.find(f => f.primary) ?? latestVersion.files?.[0];
        if (!primaryFile) throw new Error('No se encontró archivo en esta versión');
        downloadUrl = primaryFile.url;
        fileName = primaryFile.filename;
      } else if (source === 'curseforge') {
        // Buscar archivos compatibles con la versión MC
        let files = await getModFiles(pack.id, {
          gameVersion: instance?.version,
          limit: 5,
        });
        // Fallback sin filtro de versión
        if (!files || files.length === 0) {
          files = await getModFiles(pack.id, { limit: 5 });
        }
        if (!files || files.length === 0) throw new Error('No se encontraron archivos para este resource pack');
        const fileInfo = files[0];
        fileName = fileInfo.fileName;
        sha1 = extractSha1(fileInfo);
        // CurseForge a veces omite downloadUrl → usar URL del CDN como fallback
        if (fileInfo.downloadUrl) {
          downloadUrl = fileInfo.downloadUrl;
        } else {
          const fid = fileInfo.id;
          downloadUrl = `https://mediafilez.forgecdn.net/files/${Math.floor(fid / 1000)}/${fid % 1000}/${encodeURIComponent(fileName)}`;
        }
      }

      // Descargar el pack directamente a la carpeta resourcepacks/
      setProgress({ label: `Descargando ${fileName}`, percent: 0 });
      await downloadResourcePack(
        launcherDir,
        instance.id,
        downloadUrl,
        fileName,
        sha1
      );

      // Cargar lista actualizada de packs
      const packs = await listResourcePacks(launcherDir, instance.id);
      dispatch({ type: 'SET_INSTANCE_RESOURCE_PACKS', payload: packs });

      setProgress({ label: '¡Instalado!', percent: 100 });
      setTimeout(() => {
        setProgress(null);
        setInstalling(false);
        onInstalled?.();
      }, 1200);

    } catch (err) {
      setProgress({ label: `Error: ${err.message}`, percent: 0, error: true });
      setTimeout(() => { setProgress(null); setInstalling(false); }, 3000);
    } finally {
      unlisten?.();
    }
  };

  if (!pack) return (
    <div className="packbrowser-detail-empty">
      <div style={{ fontSize: 48 }}>📦</div>
      <p>Selecciona un pack para ver los detalles</p>
    </div>
  );

  return (
    <div className="packbrowser-detail">
      <div className="packbrowser-detail-header">
        {(pack.icon_url || pack.logo?.url) && (
          <img src={pack.icon_url || pack.logo?.url} alt={pack.title || pack.name} className="packbrowser-detail-icon" />
        )}
        <div>
          <h2>{pack.title || pack.name}</h2>
          {pack.author && <div className="packbrowser-detail-by">por {pack.author}</div>}
          <div className="packbrowser-detail-stats">
            <span>⬇ {(pack.downloads || pack.downloadCount || 0)?.toLocaleString()} descargas</span>
          </div>
        </div>
      </div>

      <p className="packbrowser-detail-desc">{pack.description || pack.summary || 'Sin descripción disponible'}</p>

      {/* Progreso / Botón instalar */}
      {progress ? (
        <div className="packbrowser-progress">
          <div className="packbrowser-progress-bar">
            <div
              className="packbrowser-progress-fill"
              style={{
                width: `${progress.percent}%`,
                background: progress.error ? 'var(--red)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="packbrowser-progress-label">{progress.label}</div>
        </div>
      ) : (
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 16 }}
          disabled={installing}
          onClick={handleInstall}
        >
          {installing ? '⏳ Instalando...' : '⬇ Descargar e instalar'}
        </button>
      )}
    </div>
  );
}

export default function ResourcePackBrowserModal({ instanceId, onClose }) {
  const state = useStoreState();
  const instance = state.instances.find(i => i.id === instanceId);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterSource, setFilterSource] = useState('modrinth');

  const debounceRef = useRef(null);
  const LIMIT = 20;

  const doSearch = useCallback(async (q, source, off = 0) => {
    setLoading(true);
    try {
      let data;
      if (source === 'modrinth') {
        data = await searchModrinthPacks({
          query: q,
          gameVersion: instance?.version,
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(data.hits);
        else setResults(prev => [...prev, ...data.hits]);
        setTotal(data.total_hits);
      } else {
        data = await searchCFPacks(q, {
          gameVersion: instance?.version,
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(data.data);
        else setResults(prev => [...prev, ...data.data]);
        setTotal(data.pagination.totalCount);
      }
      setOffset(off);
    } catch (err) {
      console.error('[ResourcePackBrowser] Error buscando:', err);
    } finally {
      setLoading(false);
    }
  }, [instance?.version]);

  // Búsqueda inicial
  useEffect(() => { doSearch(query, filterSource, 0); }, []);

  // Debounce en query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, filterSource, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, filterSource]);

  const loadMore = () => doSearch(query, filterSource, offset + LIMIT);

  return (
    <div className="packbrowser-overlay" onClick={onClose}>
      <div className="packbrowser-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="packbrowser-header">
          <h2>📦 Explorar Resource Packs</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Filtros */}
        <div className="packbrowser-filters">
          <input
            className="packbrowser-search"
            placeholder="Buscar resource packs..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <Select
            size="sm"
            value={filterSource}
            onChange={setFilterSource}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              { value: 'curseforge', label: 'CurseForge' },
            ]}
          />
        </div>

        {/* Cuerpo */}
        <div className="packbrowser-body">

          {/* Lista */}
          <div className="packbrowser-list">
            {loading && results.length === 0 ? (
              <div className="packbrowser-loading">Buscando...</div>
            ) : results.length === 0 ? (
              <div className="packbrowser-loading">No se encontraron packs</div>
            ) : (
              <>
                <div className="packbrowser-count">
                  {total.toLocaleString()} resultados
                </div>
                {results.map(pack => (
                  <PackCard
                    key={filterSource === 'modrinth' ? pack.project_id : pack.id}
                    pack={pack}
                    selected={
                      filterSource === 'modrinth'
                        ? selected?.project_id === pack.project_id
                        : selected?.id === pack.id
                    }
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
                    {loading ? 'Cargando...' : 'Cargar más'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Detalle */}
          <div className="packbrowser-detail-panel">
            <PackDetail
              pack={selected}
              instance={instance}
              source={filterSource}
              onInstalled={() => setSelected(null)}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
