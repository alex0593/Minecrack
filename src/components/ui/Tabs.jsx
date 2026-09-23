// Tabs.jsx — barra de pestañas accesible (role=tablist) con subrayado activo
import './Tabs.css';

/**
 * <Tabs>. Pestañas controladas: el padre posee el estado (`value`) y recibe
 * `onChange(id)`. Cada item puede llevar icono y/o badge.
 *
 * @param {object} props
 * @param {Array<{id: string, label: React.ReactNode, icon?: React.ReactNode,
 *   badge?: React.ReactNode, disabled?: boolean, className?: string}>} props.items
 * @param {string} props.value - id de la pestaña activa
 * @param {(id: string) => void} props.onChange - callback al seleccionar
 * @param {string} [props.className] - clases adicionales del contenedor
 */
export default function Tabs({ items = [], value, onChange, className = '' }) {
  return (
    <div
      className={['ui-tabs', className].filter(Boolean).join(' ')}
      role="tablist"
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            className={[
              'ui-tab',
              active ? 'ui-tab--active' : '',
              item.className || '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange && onChange(item.id)}
          >
            {item.icon && (
              <span className="ui-tab__icon" aria-hidden="true">{item.icon}</span>
            )}
            <span className="ui-tab__label">{item.label}</span>
            {item.badge != null && (
              <span className="ui-tab__badge">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
