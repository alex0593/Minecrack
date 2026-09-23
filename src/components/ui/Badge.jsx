// Badge.jsx — píldora de estado compacta (tonos del design system)
import './Badge.css';

/**
 * <Badge>. Etiqueta de estado; los tonos mapean a los colores del tema.
 *
 * @param {object} props
 * @param {'success'|'info'|'warning'|'danger'|'neutral'} [props.tone='neutral']
 * @param {boolean} [props.dot] - muestra un punto antes del texto
 * @param {string} [props.className] - clases adicionales
 */
export default function Badge({ tone = 'neutral', dot = false, className = '', children }) {
  return (
    <span
      className={['ui-badge', `ui-badge--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
