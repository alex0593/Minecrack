/**
 * ErrorView.jsx — Vista de error del modal de descarga de modpacks
 *
 * Muestra el ErrorModal cuando el flujo ha fallado (step === 'error').
 */

import ErrorModal from '../ui/ErrorModal';

export default function ErrorView({ error, onClose }) {
  return (
    <ErrorModal
      message={error.message}
      details={error.details}
      onClose={onClose}
      open
    />
  );
}
