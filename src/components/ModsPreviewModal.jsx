import './ModsPreviewModal.css';

/**
 * <ModsPreviewModal> — muestra preview de mods a importar con validación de compatibilidad
 *
 * @param {object} props
 * @param {Array} props.mods - lista de mods a importar
 * @param {string} [props.zipMcVersion] - MC version requerida por el ZIP
 * @param {string} [props.zipLoader] - loader requerido por el ZIP
 * @param {string} props.instanceVersion - MC version de la instancia
 * @param {string} props.instanceLoader - loader de la instancia
 * @param {() => void} props.onConfirm - callback al confirmar
 * @param {() => void} props.onCancel - callback al cancelar
 */
export default function ModsPreviewModal({
  mods = [],
  zipMcVersion,
  zipLoader,
  instanceVersion,
  instanceLoader,
  onConfirm,
  onCancel,
}) {
  const isCompatible = (!zipMcVersion || zipMcVersion === instanceVersion) &&
                      (!zipLoader || zipLoader === instanceLoader);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content mods-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📦 Vista previa de mods</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          {/* Advertencia de incompatibilidad */}
          {zipMcVersion && zipMcVersion !== instanceVersion && (
            <div className="compatibility-warning">
              <span>⚠️</span>
              <div>
                <strong>Versión de Minecraft incompatible</strong>
                <p>El ZIP requiere Minecraft {zipMcVersion}, pero esta instancia usa {instanceVersion}</p>
              </div>
            </div>
          )}

          {zipLoader && zipLoader !== instanceLoader && (
            <div className="compatibility-warning">
              <span>⚠️</span>
              <div>
                <strong>Loader incompatible</strong>
                <p>El ZIP requiere {zipLoader}, pero esta instancia usa {instanceLoader}</p>
              </div>
            </div>
          )}

          {/* Lista de mods */}
          <div className="mods-preview-section">
            <h3>Mods a importar ({mods.length})</h3>
            <div className="mods-preview-list">
              {mods.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No hay mods en el ZIP
                </p>
              ) : (
                mods.map((mod) => (
                  <div key={mod.id || mod.name} className="mods-preview-item">
                    <div className="mods-preview-item-info">
                      <div className="mods-preview-item-name">{mod.name}</div>
                      <div className="mods-preview-item-version">{mod.version}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Información de versiones */}
          {(zipMcVersion || zipLoader) && (
            <div className="versions-info">
              <h3>Información del ZIP</h3>
              <div className="versions-info-row">
                {zipMcVersion && (
                  <div className="version-badge">
                    <span className="version-label">Minecraft</span>
                    <span className="version-value">{zipMcVersion}</span>
                  </div>
                )}
                {zipLoader && (
                  <div className="version-badge">
                    <span className="version-label">Loader</span>
                    <span className="version-value">{zipLoader}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={!isCompatible && (zipMcVersion !== instanceVersion || zipLoader !== instanceLoader)}
            title={!isCompatible ? 'Hay incompatibilidades. Selecciona "Continuar de todas formas" si deseas proceder.' : ''}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
