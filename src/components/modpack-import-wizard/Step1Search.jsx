/** Step1Search — Paso 1: búsqueda de modpacks (Modrinth/CurseForge) con filtros */

import { useState, useEffect } from 'react';
import { searchModpacks as searchModrinthPacks } from '../../lib/api/modrinth';
import {
  searchModpacks as searchCurseforgePacks,
  isCurseForgeConfigured,
} from '../../lib/api/curseforge-modpacks';
import ModpackCard from './ModpackCard';
import './Step1Search.css';

const MC_VERSIONS = ['1.21.4', '1.21.1', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'];
const LIMIT = 20;

export default function Step1Search({ onNext }) {
  const [source, setSource] = useState('modrinth');
  const [searchQuery, setSearchQuery] = useState('');
  const [mcVersion, setMcVersion] = useState('1.21.1');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  // Cargar modpacks cuando cambia source, búsqueda o versión
  useEffect(() => {
    loadModpacks();
  }, [source, searchQuery, mcVersion]);

  const loadModpacks = async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (source === 'modrinth') {
        data = await searchModrinthPacks({
          query: searchQuery || '',
          gameVersion: mcVersion,
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(data.hits || []);
        else setResults(prev => [...prev, ...(data.hits || [])]);
        setTotal(data.total_hits || 0);
      } else {
        // CurseForge - buscar con nombre o query vacía para populares
        const result = await searchCurseforgePacks(searchQuery || ' ', {
          gameVersion: mcVersion,
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(result.data || []);
        else setResults(prev => [...prev, ...(result.data || [])]);
        setTotal(result.pagination?.total || 0);
      }
    } catch (err) {
      setError(err?.message || 'Error loading modpacks');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = (newSource) => {
    setSource(newSource);
    setResults([]);
    setOffset(0);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setResults([]);
    setOffset(0);
  };

  const handleVersionChange = (v) => {
    setMcVersion(v);
    setResults([]);
    setOffset(0);
  };

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    loadModpacks(newOffset);
  };

  const handleSelectPack = (pack) => {
    onNext({ source, pack, gameVersion: mcVersion });
  };

  return (
    <div className="wizard-step-search">
      <div className="wizard-search-header">
        <div>
          <h2>Explorador de Modpacks</h2>
          <p className="wizard-search-subtitle">Selecciona un modpack para comenzar</p>
        </div>
      </div>

      {/* Filtros: búsqueda + versión MC */}
      <div className="wizard-search-row">
        <input
          type="text"
          className="input wizard-search-input"
          placeholder="🔍 Buscar modpack por nombre..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
        <select
          className="input wizard-version-select"
          value={mcVersion}
          onChange={e => handleVersionChange(e.target.value)}
          title="Versión de Minecraft"
        >
          {MC_VERSIONS.map(v => (
            <option key={v} value={v}>MC {v}</option>
          ))}
        </select>
      </div>

      {/* Source tabs */}
      <div className="wizard-tabs">
        <button
          className={`wizard-tab ${source === 'modrinth' ? 'active' : ''}`}
          onClick={() => handleSourceChange('modrinth')}
        >
          📦 Modrinth
        </button>
        <button
          className={`wizard-tab ${source === 'curseforge' ? 'active' : ''}`}
          onClick={() => handleSourceChange('curseforge')}
          disabled={!isCurseForgeConfigured()}
        >
          🎮 CurseForge
        </button>
      </div>

      {error && (
        <div className="wizard-error">
          Error: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && results.length === 0 && (
        <div className="wizard-loading">
          <div className="wizard-spinner"></div>
          Cargando modpacks...
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <>
          <div className="wizard-results-grid">
            {results.map(pack => (
              <ModpackCard
                key={pack.project_id || pack.id}
                source={source}
                pack={pack}
                onClick={() => handleSelectPack(pack)}
              />
            ))}
          </div>

          {offset + LIMIT < total && (
            <div className="wizard-load-more-container">
              <button
                className="btn btn-ghost btn-lg"
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading ? '⏳ Cargando más...' : '📥 Cargar más modpacks'}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="wizard-no-results">
          <div className="wizard-no-results-icon">🔍</div>
          <p>{searchQuery ? 'No se encontraron modpacks con ese nombre' : 'Cargando modpacks populares...'}</p>
        </div>
      )}
    </div>
  );
}
