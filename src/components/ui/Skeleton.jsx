// Skeleton.jsx — bloque de carga con brillo (shimmer) para estados pending
import './Skeleton.css';

/**
 * <Skeleton>. Reserva de contenido mientras carga: una barra (`lines={1}`)
 * o una pila de líneas donde la última es más corta (patrón de párrafo).
 *
 * @param {object} props
 * @param {number} [props.lines=3] - número de líneas (1 = barra única)
 * @param {number|string} [props.height=12] - alto de cada línea en px
 * @param {number|string} [props.width='100%'] - ancho de las líneas
 * @param {number|string} [props.radius=6] - radio de esquina
 * @param {string} [props.className] - clases adicionales
 */
export default function Skeleton({
  lines = 3,
  height = 12,
  width = '100%',
  radius = 6,
  className = '',
}) {
  const style = { height, borderRadius: radius };

  if (lines <= 1) {
    return (
      <div
        className={['ui-skeleton', className].filter(Boolean).join(' ')}
        style={{ ...style, width }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={['ui-skeleton-stack', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="ui-skeleton"
          style={{
            ...style,
            width: i === lines - 1 ? '60%' : width,
          }}
        />
      ))}
    </div>
  );
}
