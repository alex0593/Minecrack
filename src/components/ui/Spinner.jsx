// Spinner.jsx — indicador de carga accesible
import './Spinner.css';

/**
 * <Spinner>. Anillo giratorio; anuncia "Cargando" a lectores de pantalla.
 *
 * @param {object} props
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {string} [props.label='Cargando'] - texto para aria-label
 * @param {string} [props.className] - clases adicionales
 */
export default function Spinner({ size = 'md', label = 'Cargando', className = '' }) {
  return (
    <span
      className={['ui-spinner', `ui-spinner--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-label={label}
    />
  );
}
