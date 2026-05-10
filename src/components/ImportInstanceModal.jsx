import { useState } from 'react';
import { pickFile, pickFolder, inspectInstanceZip, inspectInstanceFolder, importInstanceFromZip, importInstanceFromFolder, getLauncherDir } from '../lib/tauri';
import { useStore } from '../store';
import ProgressBar from './ui/ProgressBar';
import ErrorModal from './ui/ErrorModal';
import './ImportInstanceModal.css';

export default function ImportInstanceModal({ onClose }) {
  const { dispatch } = useStore();
  const [step, setStep] = useState('idle'); // idle | selecting | inspecting | preview | importing | done | error
  const [sourceType, setSourceType] = useState(null); // 'folder' | 'zip'
  const [sourcePath, setSourcePath] = useState(null);
  const [preview, setPreview] = useState(null);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [importedInstanceId, setImportedInstanceId] = useState(null);

  const handleSelectFolder = async () => {
    try {
      setStep('inspecting');
      setProgress(0);
      console.log('[ImportInstanceModal] Starting folder selection');

      const path = await pickFolder({
        title: 'Seleccionar carpeta de instancia'
      });

      console.log('[ImportInstanceModal] pickFolder result:', path);

      if (!path) {
        console.warn('[ImportInstanceModal] No path selected, returning to idle');
        setStep('idle');
        return;
      }

      setSourcePath(path);
      setSourceType('folder');
      setProgress(50);

      console.log('[ImportInstanceModal] Inspecting folder:', path);
      const inspection = await inspectInstanceFolder(path);
      console.log('[ImportInstanceModal] Inspection result:', inspection);
      setProgress(100);

      setPreview(inspection);
      setNewInstanceName(inspection.name ? `${inspection.name} (copia)` : 'Nueva instancia');
      setStep('preview');
      console.log('[ImportInstanceModal] Transitioned to preview step');
    } catch (err) {
      console.error('[ImportInstanceModal] Error in handleSelectFolder:', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Error desconocido');
      const errorDetails = err?.stack || (typeof err === 'string' ? '' : JSON.stringify(err));
      setError({
        message: `Error inspeccionar carpeta: ${errorMessage}`,
        details: errorDetails
      });
      setStep('error');
    }
  };

  const handleSelectZip = async () => {
    try {
      setStep('inspecting');
      setProgress(0);
      console.log('[ImportInstanceModal] Starting ZIP selection');

      const path = await pickFile({
        title: 'Seleccionar ZIP de instancia',
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      });

      console.log('[ImportInstanceModal] pickFile result:', path);

      if (!path) {
        console.warn('[ImportInstanceModal] No path selected, returning to idle');
        setStep('idle');
        return;
      }

      setSourcePath(path);
      setSourceType('zip');
      setProgress(50);

      console.log('[ImportInstanceModal] Inspecting ZIP:', path);
      const inspection = await inspectInstanceZip(path);
      console.log('[ImportInstanceModal] Inspection result:', inspection);
      setProgress(100);

      setPreview(inspection);
      setNewInstanceName(inspection.name ? `${inspection.name} (copia)` : 'Nueva instancia');
      setStep('preview');
      console.log('[ImportInstanceModal] Transitioned to preview step');
    } catch (err) {
      console.error('[ImportInstanceModal] Error in handleSelectZip:', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Error desconocido');
      const errorDetails = err?.stack || (typeof err === 'string' ? '' : JSON.stringify(err));
      setError({
        message: `Error inspeccionar ZIP: ${errorMessage}`,
        details: errorDetails
      });
      setStep('error');
    }
  };

  const handleImport = async () => {
    console.log('[ImportInstanceModal] handleImport called', { sourcePath, newInstanceName });

    if (!sourcePath || !newInstanceName) {
      console.warn('[ImportInstanceModal] Missing sourcePath or newInstanceName, aborting import');
      return;
    }

    try {
      setStep('importing');
      setProgress(0);

      console.log('[ImportInstanceModal] Getting launcher directory');
      const launcherDir = await getLauncherDir();
      console.log('[ImportInstanceModal] Launcher dir:', launcherDir);

      // Simular progreso
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(90, p + Math.random() * 20));
      }, 200);

      console.log('[ImportInstanceModal] Starting import, sourceType:', sourceType);
      const result = sourceType === 'folder'
        ? await importInstanceFromFolder(launcherDir, sourcePath, newInstanceName)
        : await importInstanceFromZip(launcherDir, sourcePath, newInstanceName);

      console.log('[ImportInstanceModal] Import result:', result);
      clearInterval(progressInterval);
      setProgress(100);

      setImportedInstanceId(result.newInstanceId);

      // Crear objeto de instancia para agregar al store
      const newInstance = {
        id: result.newInstanceId,
        name: newInstanceName,
        version: preview?.version || '1.20.1',
        loader: preview?.loader || 'vanilla',
        icon: '📦',
        installed: true,
        lastPlayed: new Date().toISOString(),
      };

      console.log('[ImportInstanceModal] Adding new instance to store:', newInstance);
      dispatch({ type: 'ADD_INSTANCE', payload: newInstance });

      setStep('done');

      // La instancia ya está en el store y aparecerá en el sidebar
      console.log('[ImportInstanceModal] Import completed successfully');

      setTimeout(() => {
        console.log('[ImportInstanceModal] Closing modal');
        onClose();
      }, 2000);
    } catch (err) {
      console.error('[ImportInstanceModal] Error in handleImport:', err);
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Error desconocido');
      const errorDetails = err?.stack || (typeof err === 'string' ? '' : JSON.stringify(err));
      setError({
        message: `Error importando instancia: ${errorMessage}`,
        details: errorDetails
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
          setStep('idle');
        }}
        open
      />
    );
  }

  // Importando...
  if (step === 'importing' || step === 'done') {
    return (
      <div className="modal-overlay">
        <div className="modal-content import-instance-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{step === 'done' ? '✓ Importada' : '📥 Importando instancia'}</h2>
          </div>

          <div className="modal-body" style={{ paddingTop: 24 }}>
            {step === 'done' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12 }}>✓</div>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, margin: 0 }}>
                  {newInstanceName}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, margin: 0 }}>
                  Instancia creada e importada correctamente
                </p>
                {preview && (
                  <>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, margin: 0 }}>
                      {preview.version} • {preview.loader} • {preview.modsCount} mods
                    </p>
                  </>
                )}
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
                  Copiando archivos de instancia...
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

  // Preview
  if (step === 'preview' && preview) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content import-instance-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📥 Vista previa de instancia</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            {/* Información de instancia */}
            <div className="import-preview-section">
              <h3>Información</h3>
              <div className="import-preview-info">
                <div className="import-preview-row">
                  <span className="import-preview-label">Nombre</span>
                  <span className="import-preview-value">{preview.name || 'Sin nombre'}</span>
                </div>
                <div className="import-preview-row">
                  <span className="import-preview-label">Minecraft</span>
                  <span className="import-preview-value">{preview.version || 'Desconocida'}</span>
                </div>
                <div className="import-preview-row">
                  <span className="import-preview-label">Loader</span>
                  <span className="import-preview-value">{preview.loader || 'Vanilla'}</span>
                </div>
                <div className="import-preview-row">
                  <span className="import-preview-label">Mods</span>
                  <span className="import-preview-value">{preview.modsCount || 0}</span>
                </div>
              </div>
            </div>

            {/* Nombre de nueva instancia */}
            <div className="import-preview-section">
              <h3>Nueva instancia</h3>
              <input
                type="text"
                className="input"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Nombre de la instancia"
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                La instancia será creada con un nuevo UUID para evitar conflictos
              </p>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!newInstanceName}
            >
              📥 Importar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Selección de fuente (carpeta o ZIP)
  if (step === 'selecting') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content import-instance-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>¿De dónde importar?</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                className="import-source-btn"
                onClick={handleSelectFolder}
              >
                <span style={{ fontSize: 32 }}>📁</span>
                <div>
                  <div className="import-source-title">Desde carpeta</div>
                  <div className="import-source-desc">Seleccionar carpeta con instancia existente</div>
                </div>
              </button>
              <button
                className="import-source-btn"
                onClick={handleSelectZip}
              >
                <span style={{ fontSize: 32 }}>📦</span>
                <div>
                  <div className="import-source-title">Desde ZIP</div>
                  <div className="import-source-desc">Seleccionar archivo ZIP exportado</div>
                </div>
              </button>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Estado inicial: botones principales
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content import-instance-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📥 Importar instancia</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Importa una instancia completa (con mods, configuración y saves) desde una carpeta o archivo ZIP.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setStep('selecting')}
          >
            📥 Importar
          </button>
        </div>
      </div>
    </div>
  );
}
