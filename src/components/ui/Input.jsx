// Input.jsx — campo de texto con etiqueta, pista y estado de error
import './Input.css';

/**
 * <Input>. Usa la clase global `.input` (index.css) y añade un envolvente con
 * etiqueta / pista / mensaje de error accesible.
 *
 * @param {object} props
 * @param {string} [props.label] - etiqueta visible del campo
 * @param {string} [props.hint] - texto de ayuda bajo el input
 * @param {string} [props.error] - mensaje de error (cambia el estilo y se anuncia)
 * @param {string} [props.className] - clases adicionales para el <input>
 * @param {string} [props.id] - id del input (para htmlFor externo)
 */
export default function Input({ label, hint, error, className = '', id, ...rest }) {
  const input = (
    <input
      id={id}
      className={['input', 'ui-input', error ? 'ui-input--error' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-invalid={error ? true : undefined}
      aria-describedby={undefined}
      {...rest}
    />
  );

  if (!label && !hint && !error) return input;

  return (
    <label className="ui-field">
      {label && <span className="ui-field__label">{label}</span>}
      {input}
      {error ? (
        <span className="ui-field__error" role="alert">{error}</span>
      ) : hint ? (
        <span className="ui-field__hint">{hint}</span>
      ) : null}
    </label>
  );
}
