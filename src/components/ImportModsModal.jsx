import { useState } from 'react';
import { importInstanceMods, listMods, getLauncherDir } from '../lib/tauri';
import { useStore } from '../store';

export default function ImportModsModal({ instanceId, onClose }) {
  const { dispatch } = useStore();
  const [mode, setMode] = useState('merge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleImport = async (zipPath) => {
    try {
      setLoading(true);
      const launcherDir = await getLauncherDir();
      const result = await importInstanceMods(launcherDir, instanceId, zipPath, mode);

      // Recargar lista de mods
      const mods = await listMods(launcherDir, instanceId);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });

      onClose();
    } catch (err) {
      setError(`Error importando mods: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📥 Importar Mods</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <input
                type="radio"
                value="merge"
                checked={mode === 'merge'}
                onChange={(e) => setMode(e.target.value)}
              />
              {' '}Mezclar (mantener mods existentes, renombrar conflictos)
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                value="replace"
                checked={mode === 'replace'}
                onChange={(e) => setMode(e.target.value)}
              />
              {' '}Reemplazar (eliminar todos los mods actuales)
            </label>
          </div>

          {error && (
            <div style={{ color: '#ff6b6b', marginBottom: 12 }}>
              ⚠️ {error}
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Selecciona un archivo .zip con mods para importarlos en esta instancia.
          </p>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            id="btn-select-zip-import"
            className="btn btn-primary"
            onClick={() => {
              // En una app real, aquí usaríamos el dialog de Tauri
              // Por ahora, simulamos con un input file
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.zip';
              input.onchange = (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImport(file.path || file.name);
                }
              };
              input.click();
            }}
            disabled={loading}
          >
            {loading ? '⏳ Importando...' : '📂 Seleccionar ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
