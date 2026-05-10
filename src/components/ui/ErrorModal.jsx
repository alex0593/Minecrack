import { useState } from 'react';
import './ErrorModal.css';

/**
 * <ErrorModal> — modal de error con detalles técnicos copiables
 *
 * @param {object} props
 * @param {string} props.message - mensaje principal de error
 * @param {string} [props.details] - detalles técnicos (stack trace, etc)
 * @param {() => void} props.onClose - callback al cerrar
 * @param {boolean} [props.open] - si está abierto (default true)
 */
export default function ErrorModal({ message, details, onClose, open = true }) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    const textToCopy = details ? `${message}\n\n${details}` : message;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header error-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <h2>Error</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="error-message">
            {message}
          </div>

          {details && (
            <div className="error-details">
              <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                DETALLES TÉCNICOS:
              </label>
              <textarea
                readOnly
                value={details}
                className="error-details-textarea"
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          {details && (
            <button
              className="btn btn-ghost"
              onClick={handleCopy}
            >
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
