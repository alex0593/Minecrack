import { useState } from 'react';
import { importInstanceMods, listMods, getLauncherDir, pickFile, inspectModsZip } from '../lib/tauri';
import { useStore } from '../store';
import ModsPreviewModal from './ModsPreviewModal';
import ErrorModal from './ui/ErrorModal';
import ProgressBar from './ui/ProgressBar';
import './ImportModsModal.css';

export default function ImportModsModal({ instanceId, onClose }) {
  const { dispatch, state } = useStore();
  const instance = state.instances.find(i => i.id === instanceId);

  const [step, setStep] = useState('idle'); // idle | inspecting | previewing | importing | done | error
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null); // { mods: [], mcVersion, loader }
  const [mode, setMode] = useState('merge');
  const [error, setError] = useState(null); // { message, details }
  const [selectedZip, setSelectedZip] = useState(null);

  const handleSelectZip = async () => {
    try {
      setStep('inspecting');
      setProgress(0);
      const zipPath = await pickFile({
        title: 'Seleccionar ZIP de mods',
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });

      if (!zipPath) {
        setStep('idle');
        return;
      }

      setSelectedZip(zipPath);
      setProgress(33);

      // Inspeccionar ZIP
      const inspection = await inspectModsZip(zipPath);
      setProgress(66);

      if (!inspection || !inspection.mods || inspection.mods.length === 0) {
        setError({
          message: 'El ZIP no contiene mods válidos o está vacío.',
          details: 'El archivo ZIP debe contener una carpeta "mods/" con archivos .jar de mods.',
        });
        setStep('error');
        setSelectedZip(null);
        return;
      }

      setPreview({
        mods: inspection.mods,
        mcVersion: inspection.mc_version,
        loader: inspection.loader,
      });

      setProgress(100);
      setStep('previewing');
    } catch (err) {
      setError({
        message: `Error al inspeccionar el ZIP: ${err.message}`,
        details: err.stack || '',
      });
      setStep('error');
      setSelectedZip(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedZip) return;

    try {
      setStep('importing');
      setProgress(0);
      const launcherDir = await getLauncherDir();

      // Simulación de progreso (el backend no emite eventos granulares)
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(80, p + Math.random() * 20));
      }, 200);

      const result = await importInstanceMods(launcherDir, instanceId, selectedZip, mode);
      clearInterval(progressInterval);
      setProgress(90);

      // Recargar lista de mods
      const mods = await listMods(launcherDir, instanceId);
      dispatch({ type: 'SET_INSTANCE_MODS', payload: mods });

      setProgress(100);
      setStep('done');

      // Cerrar después de 1.5 segundos
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError({
        message: `Error importando mods: ${err.message}`,
        details: err.stack || '',
      });
      setStep('error');
    }
  };

  const handleCancel = () => {
    if (step === 'previewing' || step === 'importing' || step === 'done') {
      setStep('idle');
      setPreview(null);
      setSelectedZip(null);
      setProgress(0);
      setMode('merge');
    } else {
      onClose();
    }
  };

  // Mostrar error modal
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

  // Mostrar preview modal
  if (step === 'previewing' && preview) {
    return (
      <ModsPreviewModal
        mods={preview.mods}
        zipMcVersion={preview.mcVersion}
        zipLoader={preview.loader}
        instanceVersion={instance?.version}
        instanceLoader={instance?.loader}
        onConfirm={handleConfirmImport}
        onCancel={handleCancel}
      />
    );
  }

  // Mostrar pantalla de importación en progreso
  if (step === 'importing' || step === 'done') {
    return (
      <div className="modal-overlay">
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{step === 'done' ? '✓ Mods importados' : '📥 Importando mods'}</h2>
          </div>

          <div className="modal-body" style={{ paddingTop: 24 }}>
            {step === 'done' ? (
              <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 14 }}>
                <p>✓ {preview?.mods?.length || 'Los'} mod(s) se han importado correctamente</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                  Cerrando en un momento...
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
                  Comprimiendo y extrayendo {preview?.mods?.length || 0} mod(s)...
                </p>
              </>
            )}
          </div>

          {step !== 'done' && (
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={handleCancel} disabled={step === 'done'}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pantalla inicial
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📥 Importar Mods</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
              Modo de importación
            </h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className={`import-mode-button ${mode === 'merge' ? 'active' : ''}`}
                onClick={() => setMode('merge')}
              >
                <span style={{ fontSize: 18 }}>🔗</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Combinar</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Mantener existentes
                  </div>
                </div>
              </button>
              <button
                className={`import-mode-button ${mode === 'replace' ? 'active' : ''}`}
                onClick={() => setMode('replace')}
              >
                <span style={{ fontSize: 18 }}>🔄</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Reemplazar</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Eliminar todos
                  </div>
                </div>
              </button>
            </div>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
            Selecciona un archivo .zip que contenga una carpeta <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>mods/</code> con tus mods en formato .jar.
          </p>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={step === 'inspecting'}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSelectZip}
            disabled={step === 'inspecting'}
          >
            {step === 'inspecting' ? '⏳ Inspeccionando...' : '📂 Seleccionar ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
