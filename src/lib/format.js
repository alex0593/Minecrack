// format.js — Helpers de formato puros (sin dependencias)

/**
 * Devuelve un string relativo en español tipo "hace 2 horas", "ayer", "hace 3 días".
 * @param {number|string|Date|null|undefined} timestamp - ms epoch, ISO string, o Date
 * @returns {string} - string relativo o "nunca" si no hay valor
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'nunca';

  const ts = typeof timestamp === 'number'
    ? timestamp
    : new Date(timestamp).getTime();

  if (isNaN(ts)) return 'nunca';

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'en el futuro';

  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 10)   return 'ahora mismo';
  if (sec < 60)   return `hace ${sec}s`;
  if (min < 60)   return `hace ${min} min`;
  if (hr  < 24)   return `hace ${hr}h`;
  if (day === 1)  return 'ayer';
  if (day < 7)    return `hace ${day} días`;
  if (day < 30)   return `hace ${Math.floor(day / 7)} sem`;
  if (day < 365)  return `hace ${Math.floor(day / 30)} meses`;
  return `hace ${Math.floor(day / 365)} años`;
}

/**
 * Formatea segundos jugados a "Xh Ym" o "Ym" si es < 1h.
 * @param {number} seconds
 * @returns {string}
 */
export function formatPlaytime(seconds) {
  if (!seconds || seconds < 0) return '0m';
  const sec = Math.floor(seconds);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);

  if (sec < 60)   return `${sec}s`;
  if (hr === 0)   return `${min}m`;
  if (hr < 24)    return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}

/**
 * Formatea bytes a unidades humanas (KB, MB, GB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Formatea velocidad bytes/sec a unidades humanas.
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Formatea segundos restantes a "Xs" o "Xm Ys" o "Xh Ym".
 * @param {number} seconds
 * @returns {string}
 */
export function formatETA(seconds) {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60)   return `${Math.ceil(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.ceil(seconds % 60);
  if (min < 60)       return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

/**
 * Devuelve un timestamp formateado tipo [HH:MM:SS] para logs de consola.
 * @param {number|Date} timestamp - opcional, default Date.now()
 * @returns {string}
 */
export function formatLogTime(timestamp = Date.now()) {
  const d = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
