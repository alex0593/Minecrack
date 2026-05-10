import './ProgressBar.css';

/**
 * <ProgressBar> — barra de progreso reutilizable
 *
 * @param {object} props
 * @param {number} props.value - progreso actual (0-100 o 0-max)
 * @param {number} [props.max] - valor máximo (default 100)
 * @param {string} [props.label] - texto a mostrar dentro/junto a la barra
 * @param {boolean} [props.animated] - animación de progreso (default true)
 * @param {string} [props.className] - clase adicional
 */
export default function ProgressBar({ value = 0, max = 100, label, animated = true, className = '' }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`progress-bar-container ${className}`}>
      <div className={`progress-bar ${animated ? 'animated' : ''}`}>
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {label && <span className="progress-bar-label">{label}</span>}
    </div>
  );
}
