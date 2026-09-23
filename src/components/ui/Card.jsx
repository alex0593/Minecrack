// Card.jsx — superficie contenedora (surface) con padding consistente
import './Card.css';

/**
 * <Card>. Contenedor de superficie elevada sobre `--bg-surface`.
 *
 * @param {object} props
 * @param {'none'|'sm'|'md'|'lg'} [props.pad='md'] - padding interior
 * @param {boolean} [props.hover] - resalta al pasar el ratón
 * @param {string} [props.className] - clases adicionales
 */
export default function Card({ pad = 'md', hover = false, className = '', children, ...rest }) {
  return (
    <div
      className={[
        'ui-card',
        `ui-card--pad-${pad}`,
        hover ? 'ui-card--hover' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
