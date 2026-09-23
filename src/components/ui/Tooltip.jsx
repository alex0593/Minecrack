// Tooltip.jsx — burbuja de ayuda puramente CSS (hover + foco)
import './Tooltip.css';

/**
 * <Tooltip>. Envuelve un elemento y muestra `content` al pasar el ratón o
 * al enfocar el hijo (`:hover` / `:focus-within`), sin JS de posicionamiento.
 * El hijo debe ser un elemento inline o inline-flex.
 *
 * @param {object} props
 * @param {React.ReactNode} props.content - texto/burbuja a mostrar
 * @param {'top'|'bottom'|'left'|'right'} [props.placement='top'] - colocación
 * @param {React.ReactNode} props.children - elemento al que se adjunta
 */
export default function Tooltip({ content, placement = 'top', children, className = '' }) {
  return (
    <span className={['ui-tooltip', className].filter(Boolean).join(' ')}>
      <span
        className={`ui-tooltip__bubble ui-tooltip__bubble--${placement}`}
        role="tooltip"
      >
        {content}
      </span>
      {children}
    </span>
  );
}
