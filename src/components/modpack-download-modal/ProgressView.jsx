/**
 * ProgressView.jsx — Vista de progreso del modal de descarga de modpacks
 *
 * Cubre los pasos 'downloading', 'installing-mods' y 'done': barra de
 * progreso, contador de mods y pantalla de instalación completada.
 */

import ProgressBar from '../ui/ProgressBar';

export default function ProgressView({
  step,
  selectedModpack,
  progress,
  progressLabel,
  modsToDownload,
  modsDownloaded,
  modsFailed,
  onClose,
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-content modpack-download-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {step === 'done'
              ? '✓ Modpack instalado'
              : '📥 Instalando modpack'}
          </h2>
        </div>

        <div className="modal-body" style={{ paddingTop: 24 }}>
          {step === 'done' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12 }}>
                ✓
              </div>
              <p style={{ color: 'var(--text-primary)', fontSize: 14, margin: 0 }}>
                {selectedModpack?.name}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, margin: 0 }}>
                Modpack instalado correctamente
              </p>
              {modsDownloaded > 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, margin: 0 }}>
                  {modsDownloaded} mod{modsDownloaded === 1 ? '' : 's'} descargado
                  {modsDownloaded === 1 ? '' : 's'}
                </p>
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
                {progressLabel}
              </p>
              {step === 'installing-mods' && modsToDownload.length > 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                  {modsDownloaded}/{modsToDownload.length} mods descargados
                  {modsFailed > 0 && (
                    <span style={{ color: 'var(--red)' }}>
                      ({modsFailed} fallido{modsFailed === 1 ? '' : 's'})
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        {step !== 'done' && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled>
              Por favor espera...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
