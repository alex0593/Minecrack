import { useState } from 'react';
import { exportInstance, getLauncherDir, pickFolder } from '../lib/tauri';
import { useStore } from '../store';
import ProgressBar from './ui/ProgressBar';
import ErrorModal from './ui/ErrorModal';
import './ExportInstanceModal.css';

export default function ExportInstanceModal({ instance, onClose }) {
  const [step, setStep] = useState('options'); // options | exporting | done | error
  const [selectedItems, setSelectedItems] = useState({
    mods: true,
    config: true,
    saves: true,
    resourcepacks: false,
  });
  const [exportFormat, setExportFormat] = useState('zip'); // zip | folder
  const [exportPath, setExportPath] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [exportResult, setExportResult] = useState(null);

  const handleSelectFormat = (format) => {
    setExportFormat(format);
  };

  const handleToggleItem = (item) => {
    setSelectedItems(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  const handleChooseLocation = async () => {
    try {
      const path = await pickFolder({
        title: 'Seleccionar ubicación para exportar'
      });
      if (path) {
        setExportPath(path);
      }
    } catch (err) {
      setError({
        message: `Error seleccionando carpeta: ${err.message}`,
        details: err.stack || ''
      });
      setStep('error');
    }
  };

  const handleExport = async () => {
    try {
      setStep('exporting');
      setProgress(0);

      const launcherDir = await getLauncherDir();
      const exportDir = exportPath || `${launcherDir}/exports`;
      const filename = `${instance.name.replace(/\s+/g, '-')}-backup`;
      const destPath = exportFormat === 'zip'
        ? `${exportDir}/${filename}.zip`
        : `${exportDir}/${filename}`;

      // Simular progreso
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(90, p + Math.random() * 25));
      }, 200);

      const result = await exportInstance(
        launcherDir,
        instance.id,
        destPath,
        selectedItems
      );

      clearInterval(progressInterval);
      setProgress(100);

      setExportResult({
        path: destPath,
        size: (result.size_bytes / (1024 * 1024)).toFixed(2),
        itemsCount: result.items_count,
        format: exportFormat
      });

      setStep('done');

      // Auto-close después de 3 segundos
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      setError({
        message: `Error exportando instancia: ${err.message}`,
        details: err.stack || ''
      });
      setStep('error');
    }
  };

  // Error modal
  if (error && step === 'error') {
    return (
      <ErrorModal
        message={error.message}
        details={error.details}
        onClose={() => {
          setError(null);
          setStep('options');
        }}
        open
      />
    );
  }

  // Pantalla de exportación en progreso
  if (step === 'exporting' || step === 'done') {
    return (
      <div className="modal-overlay">
        <div className="modal-content export-instance-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{step === 'done' ? '✓ Exportado' : '💾 Exportando instancia'}</h2>
          </div>

          <div className="modal-body" style={{ paddingTop: 24 }}>
            {step === 'done' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12 }}>✓</div>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, margin: 0 }}>
                  Instancia exportada correctamente
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, margin: 0 }}>
                  {exportResult.size} MB • {exportResult.itemsCount} elemento(s)
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, margin: 0, wordBreak: 'break-all' }}>
                  {exportResult.path}
                </p>
              </div>
            ) : (
              <>
                <ProgressBar
                  value={progress}
                  max={100}
                  label={`${Math.round(progress)}%`}
                  animated
                  style={{ marginBottom: 16 }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  Comprimiendo y copiando archivos...
                </p>
              </>
            )}
          </div>

          {step !== 'done' && (
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose} disabled={step === 'done'}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pantalla de opciones
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content export-instance-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💾 Backup de instancia</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Contenido a incluir */}
          <div className="export-section">
            <h3>¿Qué incluir?</h3>
            <div className="export-checklist">
              <label className="export-checkbox">
                <input
                  type="checkbox"
                  checked={selectedItems.mods}
                  onChange={() => handleToggleItem('mods')}
                />
                <span>🧩 Mods</span>
                <span className="export-checkbox-desc">Todos los mods instalados</span>
              </label>
              <label className="export-checkbox">
                <input
                  type="checkbox"
                  checked={selectedItems.config}
                  onChange={() => handleToggleItem('config')}
                />
                <span>⚙️ Configuración</span>
                <span className="export-checkbox-desc">Configuración de mods y launcher</span>
              </label>
              <label className="export-checkbox">
                <input
                  type="checkbox"
                  checked={selectedItems.saves}
                  onChange={() => handleToggleItem('saves')}
                />
                <span>🌍 Mundos/Saves</span>
                <span className="export-checkbox-desc">Todos los mundos jugados</span>
              </label>
              <label className="export-checkbox">
                <input
                  type="checkbox"
                  checked={selectedItems.resourcepacks}
                  onChange={() => handleToggleItem('resourcepacks')}
                />
                <span>🎨 Resource packs</span>
                <span className="export-checkbox-desc">Texture packs y shaders</span>
              </label>
            </div>
          </div>

          {/* Formato de exportación */}
          <div className="export-section">
            <h3>Formato</h3>
            <div className="export-format-buttons">
              <button
                className={`export-format-btn ${exportFormat === 'zip' ? 'active' : ''}`}
                onClick={() => handleSelectFormat('zip')}
              >
                <span style={{ fontSize: 16 }}>📦</span>
                <div>
                  <div className="export-format-title">ZIP</div>
                  <div className="export-format-desc">Comprimido, portable</div>
                </div>
              </button>
              <button
                className={`export-format-btn ${exportFormat === 'folder' ? 'active' : ''}`}
                onClick={() => handleSelectFormat('folder')}
              >
                <span style={{ fontSize: 16 }}>📁</span>
                <div>
                  <div className="export-format-title">Carpeta</div>
                  <div className="export-format-desc">Sin comprimir, directo</div>
                </div>
              </button>
            </div>
          </div>

          {/* Ubicación */}
          <div className="export-section">
            <h3>Ubicación</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
                {exportPath ? exportPath : '/exports (por defecto)'}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={handleChooseLocation}>
                📁 Cambiar
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            💾 Exportar
          </button>
        </div>
      </div>
    </div>
  );
}
