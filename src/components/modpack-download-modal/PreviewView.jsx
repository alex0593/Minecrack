/**
 * PreviewView.jsx — Vista de preview del modal de descarga de modpacks
 *
 * Muestra la descripción e información del modpack seleccionado
 * (step === 'previewing') antes de descargarlo.
 */

import { formatModpackInfo } from '../../lib/api/curseforge-modpacks';
import Modal from '../ui/Modal';

export default function PreviewView({
  selectedModpack,
  selectedVersion,
  loading,
  onClose,
  onBack,
  onInstall,
}) {
  const info = formatModpackInfo(selectedModpack, selectedVersion);

  return (
    <Modal
      open
      onClose={onClose}
      title={selectedModpack.name}
      icon="📦"
      contentClassName="modpack-download-modal"
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={onBack}
          >
            Atrás
          </button>
          <button
            className="btn btn-primary"
            onClick={onInstall}
            disabled={loading}
          >
            📥 Descargar e instalar
          </button>
        </>
      }
    >
      {selectedModpack.logo && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <img
            src={selectedModpack.logo}
            alt={selectedModpack.name}
            style={{
              maxWidth: '100%',
              maxHeight: '120px',
              borderRadius: '4px',
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Descripción</h3>
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {info.description}
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Información</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Versión:</span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {info.versionName}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Tipo:</span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {info.releaseType}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>MC Versión:</span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {info.gameVersions?.join(', ') || 'No especificada'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Tamaño:</span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {formatFileSize(info.fileSize)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}
