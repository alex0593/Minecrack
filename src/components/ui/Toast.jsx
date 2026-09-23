// Toast.jsx — avisos flotantes con store en módulo (sin provider obligatorio)
import { useSyncExternalStore } from 'react';
import './Toast.css';

let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

/**
 * `toast` — API imperativa para mostrar avisos desde cualquier módulo
 * (reducer, handlers, etc.) sin necesidad de contexto React.
 *
 * @example
 * toast.success('Instancia creada');
 * toast.error('Fallo de red', { duration: 6000 });
 */
export const toast = {
  /** Muestra un aviso genérico. */
  show(message, { tone = 'info', duration = 3500 } = {}) {
    const id = nextId++;
    toasts = [...toasts, { id, message, tone }];
    emit();
    if (duration > 0) setTimeout(() => toast.dismiss(id), duration);
    return id;
  },
  /** Cierra un aviso por id. */
  dismiss(id) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
  /** Cierra todos los avisos (uso en tests/unmount). */
  clear() {
    toasts = [];
    emit();
  },
  success(message, options) {
    return toast.show(message, { ...options, tone: 'success' });
  },
  error(message, options) {
    return toast.show(message, {
      ...options,
      tone: 'danger',
      duration: options?.duration ?? 6000,
    });
  },
};

/**
 * <ToastViewport> — contenedor fijo (esquina inferior derecha) que pinta los
 * avisos activos. Montarlo una sola vez, p. ej. en `App.jsx`.
 */
export function ToastViewport() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!items.length) return null;

  return (
    <div className="ui-toast-viewport" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`ui-toast ui-toast--${t.tone}`}
          role="status"
        >
          <span className="ui-toast__msg">{t.message}</span>
          <button
            type="button"
            className="ui-toast__close"
            aria-label="Cerrar"
            onClick={() => toast.dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
