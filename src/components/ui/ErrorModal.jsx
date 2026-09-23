import { useState } from 'react';
import Modal from './Modal';
import './ErrorModal.css';

/**
 * <ErrorModal> — modal de error con detalles técnicos copiables
 *
 * Migrado al shell `<Modal>`: `Esc`, `×` y overlay cierran de forma
 * consistente (ver `docs/ui-baseline.md` hallazgo 2).
 *
 * @param {object} props
 * @param {string} props.message - mensaje principal de error
 * @param {string} [props.details] - detalles técnicos (stack trace, etc)
 * @param {() => void} props.onClose - callback al cerrar
 * @param {boolean} [props.open] - si está abierto (default true)
 */
export default function ErrorModal({ message, details, onClose, open = true }) {
  const [copied, setCopied] = useState(false);

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
    <Modal
      open={open}
      onClose={onClose}
      title="Error"
      icon="⚠️"
      contentClassName="error-modal"
      headerClassName="error-header"
      footer={
        <>
          {details && (
            <button className="btn btn-ghost" onClick={handleCopy}>
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </>
      }
    >
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
    </Modal>
  );
}
