/** Step2Preview — Paso 2: vista previa del modpack y selección de versión */

import { useState, useEffect } from 'react';
import { getModpackWithVersions as getCFModpackWithVersions } from '../../lib/api/curseforge-modpacks';
import './Step2Preview.css';

export default function Step2Preview({ source, pack, gameVersion, onNext, onBack }) {
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
      <h2>Vista previa del modpack</h2>

      {loading && <div className="wizard-loading">Cargando versiones...</div>}

      {!loading && (
        <>
          <div className="wizard-preview-header">
            {display.icon && (
              <img src={display.icon} alt={display.title} className="wizard-preview-icon" />
            )}
            <div className="wizard-preview-info">
              <h3>{display.title}</h3>
              <p className="wizard-preview-author">por {display.author}</p>
              <p className="wizard-preview-desc">{display.desc}</p>
            </div>
          </div>

          {versions.length === 0 && !error && (
            <div className="wizard-error">No se encontraron versiones para esta combinación de MC/loader.</div>
          )}

          {versions.length > 0 && (
            <div className="wizard-version-selector">
              <label>Seleccionar versión:</label>
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
          )}

          {error && <div className="wizard-error">{error}</div>}

          <div className="wizard-button-group">
            <button className="btn btn-ghost" onClick={onBack}>Atrás</button>
            <button
              className="btn btn-primary"
              onClick={() => onNext(selectedVersion)}
              disabled={!selectedVersion}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
