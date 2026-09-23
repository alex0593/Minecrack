// Button.jsx — botón reutilizable sobre las clases globales .btn (index.css)
import './Button.css';

/**
 * <Button>. Envuelve las clases globales existentes (`.btn`, `.btn-*`) para que
 * cualquier migración sea compatible con el CSS actual sin cambios visuales.
 *
 * @param {object} props
 * @param {'primary'|'ghost'|'danger'} [props.variant='ghost'] - variante visual
 * @param {'xs'|'sm'|'md'|'lg'} [props.size='md'] - tamaño
 * @param {boolean} [props.loading] - muestra spinner interno y deshabilita
 * @param {boolean} [props.block] - ancho completo del contenedor
 * @param {React.ReactNode} [props.icon] - icono/emoji a la izquierda del texto
 * @param {string} [props.className] - clases adicionales
 * @param {React.ReactNode} [props.children] - contenido del botón
 */
export default function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  block = false,
  icon = null,
  className = '',
  children,
  disabled = false,
  type = 'button',
  ...rest
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    loading ? 'ui-btn--loading' : '',
    'ui-btn',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {!loading && icon && (
        <span className="ui-btn__icon" aria-hidden="true">{icon}</span>
      )}
      <span className="ui-btn__label">{children}</span>
    </button>
  );
}
