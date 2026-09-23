import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import { formatLogTime } from '../../lib/format';

/** ConsoleTab — consola de logs del juego con filtros, búsqueda y auto-scroll */
export default function ConsoleTab() {
  const { state, dispatch } = useStore();
  const { gameLogs, gameRunning } = state;
  const [filter, setFilter] = useState('all');         // 'all' | 'info' | 'warn' | 'error'
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef(null);
  const lastScrollHeight = useRef(0);

  // Contadores por nivel
  const counts = useMemo(() => {
    const c = { all: gameLogs.length, info: 0, warn: 0, error: 0 };
    for (const log of gameLogs) {
      const lvl = log.level ?? 'info';
      if (lvl === 'warn' || lvl === 'error') c[lvl]++;
      else c.info++;
    }
    return c;
  }, [gameLogs]);

  // Logs filtrados (por nivel + búsqueda)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gameLogs.filter(log => {
      const lvl = log.level ?? 'info';
      if (filter !== 'all') {
        if (filter === 'info' && (lvl === 'warn' || lvl === 'error')) return false;
        if (filter === 'warn' && lvl !== 'warn') return false;
        if (filter === 'error' && lvl !== 'error') return false;
      }
      if (q && !String(log.text).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gameLogs, filter, search]);

  // Auto-scroll al fondo cuando llegan nuevos logs (si está activo)
  useEffect(() => {
    if (!bodyRef.current) return;
    if (autoScroll) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
    lastScrollHeight.current = bodyRef.current.scrollHeight;
  }, [filtered.length, autoScroll]);

  // Detectar scroll manual del usuario para pausar auto-scroll
  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 50;
    setAutoScroll(nearBottom);
  }

  function jumpToBottom() {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    setAutoScroll(true);
  }

  function copyAll() {
    navigator.clipboard.writeText(filtered.map(l => l.text).join('\n'));
  }

  function clearAll() {
    if (gameRunning) return;
    dispatch({ type: 'CLEAR_GAME_LOGS' });
  }

  // Highlight de matches dentro de una línea
  function highlightMatch(text) {
    if (!search.trim()) return text;
    const q = search.trim();
    const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'ig'));
    return parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase()
        ? <mark key={i}>{p}</mark>
        : <span key={i}>{p}</span>
    );
  }

  // Empty state cuando no hay logs ni juego
  if (gameLogs.length === 0) {
    return (
      <div className="console-wrap">
        <div className="console-empty">
          <div className="empty-state">
            <div className="empty-state-illustration">💻</div>
            <h3 className="empty-state-title">Consola vacía</h3>
            <p className="empty-state-desc">
              {gameRunning
                ? 'El juego está iniciando — los logs aparecerán pronto…'
                : 'Inicia el juego para ver los logs aquí. La consola muestra mensajes del cliente Minecraft y el loader.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-wrap">
      {/* Header con filtros, búsqueda y acciones */}
      <div className="console-header">
        <div className="console-filters">
          <button
            className={`console-chip${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todo <span className="console-chip-count">{counts.all}</span>
          </button>
          <button
            className={`console-chip${filter === 'info' ? ' is-active' : ''}`}
            onClick={() => setFilter('info')}
          >
            Info <span className="console-chip-count">{counts.info}</span>
          </button>
          <button
            className={`console-chip chip-warn${filter === 'warn' ? ' is-active' : ''}`}
            onClick={() => setFilter('warn')}
          >
            Warn <span className="console-chip-count">{counts.warn}</span>
          </button>
          <button
            className={`console-chip chip-error${filter === 'error' ? ' is-active' : ''}`}
            onClick={() => setFilter('error')}
          >
            Error <span className="console-chip-count">{counts.error}</span>
          </button>
        </div>

        <input
          type="text"
          className="console-search"
          placeholder="Buscar en logs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="console-actions">
          <button
            className="console-action-btn"
            onClick={copyAll}
            title="Copiar logs visibles"
          >📋 Copiar</button>
          <button
            className="console-action-btn"
            onClick={clearAll}
            title="Limpiar consola (solo si el juego no está corriendo)"
            disabled={gameRunning}
          >🗑 Limpiar</button>
        </div>
      </div>

      {/* Body con logs */}
      <div
        ref={bodyRef}
        className="console-body"
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="console-empty">
            <div className="empty-state">
              <p className="empty-state-desc">
                Sin resultados con los filtros actuales.
              </p>
            </div>
          </div>
        ) : (
          // Render solo las últimas 1000 líneas para performance
          filtered.slice(-1000).map((line, i) => {
            const lvl = line.level ?? 'info';
            const time = line.timestamp ? formatLogTime(line.timestamp) : formatLogTime();
            return (
              <div key={i} className="console-line">
                <span className="console-line-time">{time}</span>
                <span className={`console-line-level console-line-level-${lvl}`}>{lvl}</span>
                <span className="console-line-msg">{highlightMatch(line.text)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Floating button para saltar al final si el user scrolleó arriba */}
      {!autoScroll && filtered.length > 0 && (
        <button className="console-jump-bottom" onClick={jumpToBottom}>
          ↓ Saltar al final
        </button>
      )}
    </div>
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
