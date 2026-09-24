// Modal.jsx — shell de modal accesible: Esc global, overlay y botón × consistentes
import { useEffect, useRef } from 'react';
import './Modal.css';

/**
 * <Modal>. Unifica el comportamiento de los modales de la app (hasta ahora
 * inconsistente, ver `docs/ui-baseline.md` hallazgo 2):
 * - `Esc` SIEMPRE cierra (listener a nivel de document, aunque el foco esté en un input)
 * - el overlay cierra (opcional) y el contenido nunca propaga al overlay
 * - botón `×` con aria-label, foco inicial en el diálogo y scroll del body bloqueado
 *
 * @param {object} props
 * @param {boolean} [props.open] - si el modal está visible
 * @param {() => void} [props.onClose] - callback de cierre
 * @param {string} [props.title] - título del diálogo
 * @param {string} [props.subtitle] - subtítulo bajo el título
 * @param {React.ReactNode} [props.icon] - icono junto al título
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md'] - ancho máximo del diálogo
 * @param {boolean} [props.showClose=true] - muestra el botón ×
 * @param {boolean} [props.closeOnOverlay=true] - cierra al pulsar el fondo
 * @param {boolean} [props.closeOnEsc=true] - cierra con la tecla Escape
 * @param {string} [props.contentClassName] - clases para el cuadro del diálogo
 * @param {string} [props.headerClassName] - clases para la cabecera
 * @param {React.ReactNode} [props.footer] - zona de acciones inferior
 */
export default function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  showClose = true,
  closeOnOverlay = true,
  closeOnEsc = true,
  className = '',
  contentClassName = '',
  headerClassName = '',
  children,
  footer,
}) {
  const dialogRef = useRef(null);

  // Esc siempre activo a nivel document (el foco en un input no lo sabotea)
  useEffect(() => {
    if (!open || !closeOnEsc) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeOnEsc, onClose]);

  // Bloquear scroll del fondo + foco inicial en el diálogo (si el foco ya está
  // dentro — p. ej. un input con autoFocus — no lo robamos)
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
      dialogRef.current.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size !== 'md' ? `ui-modal--${size}` : '';
  const hasHeader = Boolean(title || subtitle || icon || showClose);

  return (
    <div
      className={['ui-modal-overlay', className].filter(Boolean).join(' ')}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={['ui-modal', sizeClass, contentClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {hasHeader && (
          <div className={['ui-modal-header', headerClassName].filter(Boolean).join(' ')}>
            <div className="ui-modal-heading">
              {icon && <span className="ui-modal-icon" aria-hidden="true">{icon}</span>}
              <div className="ui-modal-titles">
                {title && <h2 className="ui-modal-title">{title}</h2>}
                {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
              </div>
            </div>
            {showClose && (
              <button
                type="button"
                className="ui-modal-close"
                aria-label="Cerrar"
                onClick={onClose}
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
