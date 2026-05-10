// Select.jsx — Custom dropdown reusable, accesible y con estilo del tema
import { useEffect, useRef, useState, useMemo } from 'react';
import './Select.css';

/**
 * <Select> custom dropdown.
 *
 * @param {object} props
 * @param {string|number} props.value - valor seleccionado
 * @param {(v: string|number) => void} props.onChange - callback al seleccionar
 * @param {Array<{value: any, label: string, badge?: string, disabled?: boolean}>} props.options
 * @param {string} [props.placeholder] - texto si no hay valor
 * @param {boolean} [props.disabled]
 * @param {string} [props.className] - clase adicional
 * @param {string} [props.size] - 'sm' | 'md' (default 'md')
 * @param {boolean} [props.searchable] - si muestra input de búsqueda dentro
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Seleccionar…',
  disabled = false,
  className = '',
  size = 'md',
  searchable = false,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  // Encontrar la opción seleccionada
  const selected = useMemo(
    () => options.find(o => o.value === value),
    [options, value]
  );

  // Filtrar opciones si searchable
  const filtered = useMemo(() => {
    if (!searchable || !query) return options;
    const q = query.toLowerCase();
    return options.filter(o => String(o.label).toLowerCase().includes(q));
  }, [options, query, searchable]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Reset highlight cuando se abre o filtra
  useEffect(() => {
    if (open) {
      const idx = filtered.findIndex(o => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
      // Auto-focus search si aplica
      if (searchable) {
        setTimeout(() => searchRef.current?.focus(), 10);
      }
    } else {
      setQuery('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll a la opción highlightada
  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function pickOption(opt) {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(filtered.length - 1, h + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pickOption(opt);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setHighlight(filtered.length - 1);
      return;
    }
  }

  return (
    <div
      ref={rootRef}
      className={`ui-select ui-select-${size} ${disabled ? 'is-disabled' : ''} ${open ? 'is-open' : ''} ${className}`}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="ui-select-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`ui-select-value ${selected ? '' : 'is-placeholder'}`}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.badge && (
          <span className="ui-select-badge">{selected.badge}</span>
        )}
        <span className="ui-select-arrow" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="ui-select-popover">
          {searchable && (
            <div className="ui-select-search">
              <input
                ref={searchRef}
                className="ui-select-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar…"
              />
            </div>
          )}

          <ul ref={listRef} className="ui-select-list" role="listbox">
            {filtered.length === 0 && (
              <li className="ui-select-empty">Sin resultados</li>
            )}
            {filtered.map((opt, idx) => (
              <li
                key={String(opt.value) + idx}
                data-idx={idx}
                className={`ui-select-option ${idx === highlight ? 'is-highlighted' : ''} ${opt.value === value ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pickOption(opt)}
              >
                <span className="ui-select-option-label">{opt.label}</span>
                {opt.badge && (
                  <span className="ui-select-option-badge">{opt.badge}</span>
                )}
                {opt.value === value && (
                  <span className="ui-select-option-check" aria-hidden="true">✓</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
