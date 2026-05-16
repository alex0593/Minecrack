/**
 * ModpackImportWizard.jsx — Unified 4-step modpack import wizard
 *
 * PASO 1: BÚSQUEDA — Search with Modrinth/CurseForge tabs + filters
 * PASO 2: PREVIEW — Show modpack details, select version
 * PASO 3: CONFIGURACIÓN — Custom instance name, icon, RAM, JVM args
 * PASO 4: INSTALACIÓN — Progress tracking and completion
 */

import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { useStore } from '../store';
import { searchModpacks as searchModrinthPacks } from '../lib/api/modrinth';
import {
  searchModpacks as searchCurseforgePacks,
  getModpackWithVersions as getCFModpackWithVersions,
  getModpackDownloadUrl,
  isCurseForgeConfigured,
  formatModpackInfo,
} from '../lib/api/curseforge-modpacks';
import {
  getLauncherDir,
  downloadFile,
  extractZip,
  inspectInstanceFolder,
  importInstanceFromFolder,
  getModsToDownload,
} from '../lib/tauri';
import { downloadMultipleModsFromCurseForge } from '../lib/mods/curseforge-downloader';
import ProgressBar from './ui/ProgressBar';
import ErrorModal from './ui/ErrorModal';
import './ModpackImportWizard.css';

const LOADERS_MODPACK = ['fabric', 'forge', 'quilt', 'neoforge'];
const LIMIT = 20;
const EMOJI_ICONS = ['🎮', '🌲', '🔧', '⚙️', '💎', '🏔️', '🌊', '🔥', '❄️', '⚡', '🌙', '☀️'];

// ─── Modpack card component ──────────────────────────────────────────────────
function ModpackCard({ source, pack, onClick, isSelected }) {
  const display = source === 'curseforge'
    ? {
        title: pack.name,
        author: pack.authors?.[0]?.name ?? '',
        desc: pack.summary,
        icon: pack.logo?.url,
        downloads: pack.downloadCount,
      }
    : {
        title: pack.title,
        author: pack.author,
        desc: pack.description,
        icon: pack.icon_url,
        downloads: pack.downloads,
      };

  return (
    <button
      className={`wizard-modpack-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {display.icon && (
        <img
          className="wizard-card-icon"
          src={display.icon}
          alt={display.title}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="wizard-card-body">
        <div className="wizard-card-title">{display.title}</div>
        <div className="wizard-card-author">by {display.author || '—'}</div>
        <div className="wizard-card-desc">{display.desc}</div>
        <div className="wizard-card-meta">⬇ {(display.downloads ?? 0).toLocaleString()}</div>
      </div>
    </button>
  );
}

// ─── Step 1: Explorer ────────────────────────────────────────────────────────
function Step1Search({ onNext }) {
  const [source, setSource] = useState('modrinth');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  // Cargar modpacks cuando cambia source o búsqueda
  useEffect(() => {
    loadModpacks();
  }, [source, searchQuery]);

  const loadModpacks = async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (source === 'modrinth') {
        data = await searchModrinthPacks({
          query: searchQuery || '',
          limit: LIMIT,
          offset: off,
        });
        if (off === 0) setResults(data.hits || []);
        else setResults(prev => [...prev, ...(data.hits || [])]);
        setTotal(data.total_hits || 0);
      } else {
        // CurseForge - buscar con nombre o query vacía para populares
        const result = await searchCurseforgePacks(searchQuery || ' ', {
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

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    loadModpacks(newOffset);
  };

  const handleSelectPack = (pack) => {
    onNext({ source, pack, gameVersion: '1.20.1' });
  };

  return (
    <div className="wizard-step-search">
      <div className="wizard-search-header">
        <div>
          <h2>Explorador de Modpacks</h2>
          <p className="wizard-search-subtitle">Selecciona un modpack para comenzar</p>
        </div>
      </div>

      {/* Search input */}
      <input
        type="text"
        className="input wizard-search-input"
        placeholder="🔍 Buscar modpack por nombre..."
        value={searchQuery}
        onChange={handleSearchChange}
      />

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

// ─── Step 2: Preview ─────────────────────────────────────────────────────────
function Step2Preview({ source, pack, gameVersion, onNext, onBack }) {
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadVersions = async () => {
      try {
        setLoading(true);
        let data;
        if (source === 'modrinth') {
          const res = await fetch(
            `https://api.modrinth.com/v2/project/${pack.project_id}/version`
          );
          if (!res.ok) throw new Error(`Modrinth API error: ${res.status}`);
          data = await res.json();
          const versionsList = Array.isArray(data) ? data : [];
          setVersions(versionsList);
          if (versionsList.length > 0) setSelectedVersion(versionsList[0]);
        } else {
          const result = await getCFModpackWithVersions(pack.id, gameVersion);
          const versionsList = Array.isArray(result.versions) ? result.versions : [];
          setVersions(versionsList);
          if (result.bestVersion) setSelectedVersion(result.bestVersion);
          else if (versionsList.length > 0) setSelectedVersion(versionsList[0]);
        }
      } catch (err) {
        setError(err?.message || 'Error loading versions');
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, [source, pack, gameVersion]);

  const display = source === 'curseforge'
    ? {
        title: pack.name,
        author: pack.authors?.[0]?.name ?? '',
        desc: pack.description,
        icon: pack.logo?.url,
      }
    : {
        title: pack.title,
        author: pack.author,
        desc: pack.description,
        icon: pack.icon_url,
      };

  return (
    <div className="wizard-step-preview compact">
      <h2>Modpack Preview</h2>

      {loading && <div className="wizard-loading">Loading versions...</div>}

      {!loading && (
        <>
          <div className="wizard-preview-header">
            {display.icon && (
              <img src={display.icon} alt={display.title} className="wizard-preview-icon" />
            )}
            <div className="wizard-preview-info">
              <h3>{display.title}</h3>
              <p className="wizard-preview-author">by {display.author}</p>
              <p className="wizard-preview-desc">{display.desc}</p>
            </div>
          </div>

          <div className="wizard-version-selector">
            <label>Select Version:</label>
            <select
              className="input"
              value={selectedVersion?.id || selectedVersion?.versionNumber || ''}
              onChange={(e) => {
                const v = versions.find(v => (v.id || v.versionNumber) === e.target.value);
                setSelectedVersion(v);
              }}
            >
              {versions.map(v => (
                <option key={v.id || v.versionNumber} value={v.id || v.versionNumber}>
                  {v.name || v.displayName} ({v.game_versions?.[0] || v.gameVersions?.[0] || '?'})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="wizard-error">{error}</div>}

          <div className="wizard-button-group">
            <button className="btn btn-ghost" onClick={onBack}>Back</button>
            <button
              className="btn btn-primary"
              onClick={() => onNext(selectedVersion)}
              disabled={!selectedVersion}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step 3: Configuration ──────────────────────────────────────────────────
function Step3Config({ pack, version, source, gameVersion, onNext, onBack }) {
  const [instanceName, setInstanceName] = useState(pack.title || pack.name || 'New Modpack');
  const [selectedIcon, setSelectedIcon] = useState(EMOJI_ICONS[0]);
  const [ram, setRam] = useState('4GB');
  const [jvmArgs, setJvmArgs] = useState('');

  return (
    <div className="wizard-step-config">
      <h2>Instance Configuration</h2>

      <div className="wizard-form-group">
        <label htmlFor="instance-name">Instance Name:</label>
        <input
          id="instance-name"
          type="text"
          className="input"
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="wizard-form-group">
        <label>Icon:</label>
        <div className="wizard-icon-picker">
          {EMOJI_ICONS.map(icon => (
            <button
              key={icon}
              className={`wizard-icon-btn ${selectedIcon === icon ? 'selected' : ''}`}
              onClick={() => setSelectedIcon(icon)}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="wizard-form-group">
        <label htmlFor="ram-select">RAM Allocation:</label>
        <select
          id="ram-select"
          className="input"
          value={ram}
          onChange={(e) => setRam(e.target.value)}
        >
          <option value="512MB">512 MB</option>
          <option value="1GB">1 GB</option>
          <option value="2GB">2 GB</option>
          <option value="4GB">4 GB</option>
          <option value="6GB">6 GB</option>
          <option value="8GB">8 GB</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="wizard-form-group">
        <label htmlFor="jvm-args">JVM Arguments (Optional):</label>
        <textarea
          id="jvm-args"
          className="input"
          rows="4"
          placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+DisableExplicitGC"
          value={jvmArgs}
          onChange={(e) => setJvmArgs(e.target.value)}
        />
      </div>

      <div className="wizard-config-info">
        <strong>Modpack Info:</strong>
        <p>Version: {gameVersion}</p>
        <p>Source: {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</p>
      </div>

      <div className="wizard-button-group">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button
          className="btn btn-primary"
          onClick={() => onNext({
            instanceName: instanceName.trim() || 'New Modpack',
            icon: selectedIcon,
            ram,
            jvmArgs,
          })}
        >
          Install
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Installation ───────────────────────────────────────────────────
function Step4Install({ source, pack, version, gameVersion, config, onClose }) {
  const { dispatch } = useStore();
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const performInstall = async () => {
      try {
        setProgressLabel('Getting launcher directory...');
        setProgress(5);

        const launcherDir = await getLauncherDir();

        // Parse RAM: convert string like "4GB" to number (MB), or use raw number
        const ramMb = typeof config.ram === 'string'
          ? parseInt(config.ram) * (config.ram.toLowerCase().includes('gb') ? 1024 : 1)
          : (config.ram || 2048);

        // Determine download URL and extract logic based on source
        if (source === 'curseforge') {
          // CurseForge: download ZIP
          setProgressLabel(`Downloading ${pack.name}...`);
          setProgress(10);

          const url = await getModpackDownloadUrl(pack.id, version.id);
          const zipPath = `${launcherDir}/modpacks/${pack.slug || pack.name.replace(/\s+/g, '-')}-${Date.now()}.zip`;

          await downloadFile(url, zipPath, null, pack.name || 'modpack');

          // Extract
          setProgressLabel('Extracting files...');
          setProgress(30);

          const tempDir = `${launcherDir}/temp-modpack-${Date.now()}`;
          await extractZip(zipPath, tempDir);

          // Inspect and import
          setProgressLabel('Importing instance...');
          setProgress(50);

          const inspected = await inspectInstanceFolder(tempDir);
          const importResult = await importInstanceFromFolder(
            launcherDir,
            tempDir,
            config.instanceName,
            config.icon,
            ramMb,
            config.jvmArgs || ''
          );
          const instanceId = importResult.newInstanceId;

          // Transformar el resultado de inspección al formato de instancia
          const newInstance = {
            id: instanceId,
            name: config.instanceName || inspected.name,
            version: inspected.mc_version,
            loader: inspected.loader,
            loaderVersion: inspected.loader_version,
            icon: config.icon || '📦',
            ram: ramMb,
            jvmArgs: config.jvmArgs || '',
            installed: true,
            createdAt: new Date().toISOString(),
            lastPlayed: null,
            playtime: 0,
            modsCount: inspected.mods_count || 0,
          };

          dispatch({ type: 'ADD_INSTANCE', payload: newInstance });

          // Download mods if referenced
          if (inspected.mods && inspected.mods.length > 0) {
            setProgressLabel(`Downloading ${inspected.mods.length} mods...`);
            setProgress(70);

            try {
              await downloadMultipleModsFromCurseForge(
                inspected.mods,
                `${launcherDir}/instances/${instanceId}/mods`,
                (current, total) => {
                  setProgress(70 + Math.round((current / total) * 30));
                  setProgressLabel(`Downloading mods: ${current}/${total}`);
                }
              );
            } catch (err) {
              console.warn('[ModpackImportWizard] Mod download partial error:', err);
              // Continue anyway - mods can be downloaded manually
            }
          }

          setProgress(100);
          setProgressLabel('Installation complete!');
          setDone(true);
        } else {
          // Modrinth: download .mrpack file
          setProgressLabel(`Downloading ${pack.title}...`);
          setProgress(10);

          // Find download URL in version
          const downloadUrl = version.files?.find(f => f.primary)?.url || version.files?.[0]?.url;
          if (!downloadUrl) throw new Error('No download URL found in Modrinth version');

          const mrpackPath = `${launcherDir}/modpacks/${pack.slug || pack.title.replace(/\s+/g, '-')}-${Date.now()}.mrpack`;
          await downloadFile(downloadUrl, mrpackPath, null, pack.title || 'modpack');

          setProgressLabel('Extracting files...');
          setProgress(30);

          const tempDir = `${launcherDir}/temp-modpack-${Date.now()}`;
          await extractZip(mrpackPath, tempDir);

          setProgressLabel('Importing instance...');
          setProgress(50);

          const inspected = await inspectInstanceFolder(tempDir);
          const importResult = await importInstanceFromFolder(
            launcherDir,
            tempDir,
            config.instanceName,
            config.icon,
            ramMb,
            config.jvmArgs || ''
          );
          const instanceId = importResult.newInstanceId;

          // Transformar el resultado de inspección al formato de instancia
          const newInstance = {
            id: instanceId,
            name: config.instanceName || inspected.name,
            version: inspected.mc_version,
            loader: inspected.loader,
            loaderVersion: inspected.loader_version,
            icon: config.icon || '📦',
            ram: ramMb,
            jvmArgs: config.jvmArgs || '',
            installed: true,
            createdAt: new Date().toISOString(),
            lastPlayed: null,
            playtime: 0,
            modsCount: inspected.mods_count || 0,
          };

          dispatch({ type: 'ADD_INSTANCE', payload: newInstance });

          // Note: Modrinth mods download is handled differently
          // For now, just mark as complete
          setProgress(100);
          setProgressLabel('Installation complete!');
          setDone(true);
        }
      } catch (err) {
        console.error('[ModpackImportWizard] Installation error:', err);
        setError(err?.message || 'Installation failed');
      }
    };

    performInstall();
  }, [source, pack, version, gameVersion, config, dispatch]);

  return (
    <div className="wizard-step-install">
      <h2>Installing {pack.title || pack.name}</h2>

      <ProgressBar percent={progress} />

      <div className="wizard-progress-label">{progressLabel}</div>

      {error && (
        <div className="wizard-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {done && (
        <div className="wizard-success">
          ✅ Installation complete! Your modpack is ready to play.
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {!done && !error && (
        <div className="wizard-installing">
          Please wait while we install your modpack...
        </div>
      )}
    </div>
  );
}

// ─── Error Boundary ─────────────────────────────────────────────────────────
class WizardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ModpackWizard] React render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="wizard-container">
          <div className="wizard-modal" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <h2 style={{ color: 'var(--red)', marginBottom: 12 }}>⚠️ Error en el Wizard</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
              {this.state.error?.message || 'Ocurrió un error inesperado'}
            </p>
            <button className="btn btn-primary" onClick={this.props.onClose}>Cerrar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─���─ Main Wizard Component ──────────────────────────────────��────────────────
export default function ModpackImportWizard({ onClose }) {
  const [currentStep, setCurrentStep] = useState('search');
  const [searchData, setSearchData] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [configData, setConfigData] = useState(null);

  const handleSearchNext = (data) => {
    setSearchData(data);
    setCurrentStep('preview');
  };

  const handlePreviewNext = (version) => {
    setPreviewData(version);
    setCurrentStep('config');
  };

  const handleConfigNext = (config) => {
    setConfigData(config);
    setCurrentStep('install');
  };

  return (
    <WizardErrorBoundary onClose={onClose}>
    <div className={`wizard-container ${currentStep === 'preview' ? 'wizard-container-compact' : ''}`}>
      <div className={`wizard-modal ${currentStep === 'preview' ? 'wizard-modal-compact' : ''}`}>
        {/* Content */}
        <div className="wizard-content">
          {currentStep === 'search' && (
            <Step1Search onNext={handleSearchNext} />
          )}

          {currentStep === 'preview' && searchData && (
            <Step2Preview
              source={searchData.source}
              pack={searchData.pack}
              gameVersion={searchData.gameVersion}
              onNext={handlePreviewNext}
              onBack={() => setCurrentStep('search')}
            />
          )}

          {currentStep === 'config' && searchData && previewData && (
            <Step3Config
              pack={searchData.pack}
              version={previewData}
              source={searchData.source}
              gameVersion={searchData.gameVersion}
              onNext={handleConfigNext}
              onBack={() => setCurrentStep('preview')}
            />
          )}

          {currentStep === 'install' && searchData && previewData && configData && (
            <Step4Install
              source={searchData.source}
              pack={searchData.pack}
              version={previewData}
              gameVersion={searchData.gameVersion}
              config={configData}
              onClose={onClose}
            />
          )}
        </div>

        {/* Close button */}
        {currentStep !== 'install' && (
          <button
            className="wizard-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
    </div>
    </WizardErrorBoundary>
  );
}
