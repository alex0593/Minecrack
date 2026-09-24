import { LOADERS } from '../../lib/instances';
import { formatPlaytime, formatRelativeTime } from '../../lib/format';
import './InstanceHero.css';

/* ─── Helpers ─────────────────────────────────── */
const loaderBadge = (loader) => {
  const l = LOADERS.find(x => x.id === loader);
  return l ? <span className={`badge ${l.color}`}>{l.label}</span> : null;
};

/** InstanceHero — cabecera de la instancia: icono, badges, meta y acciones (jugar, sync, exportar) */
export default function InstanceHero({
  instance,
  modsCount,
  isThisRunning,
  syncing,
  onPlay,
  onSync,
  onRestoreQuarantine,
  onVerify,
  onSettings,
  onShowExport,
}) {
  return (
    <div className="instance-hero">
      <div className="instance-hero-bg" />
      <div className="instance-hero-content">
        <div className="instance-big-icon">{instance.icon}</div>
        <div className="instance-hero-info">
          <h2 className="instance-hero-name">{instance.name}</h2>
          <div className="instance-hero-meta">
            <span className="badge badge-gray">MC {instance.version}</span>
            {loaderBadge(instance.loader)}
            <span className="badge badge-gray">
              {modsCount} mods
            </span>
            {isThisRunning && (
              <span className="status-pill status-pill-running">
                <span className="dot" />
                Jugando
              </span>
            )}
            {instance.remoteModpack && (
              <span className={`status-pill ${instance.lastSyncStatus === 'ready' ? 'status-pill-running' : ''}`}>
                ☁ {syncing ? 'Sincronizando' : instance.lastSyncStatus === 'ready' ? `Release ${instance.lastSyncedReleaseId}` : 'Remoto'}
              </span>
            )}
          </div>
          <div className="hero-meta">
            <span className="hero-meta-item" title="Tiempo total jugado">
              <span className="icon">🕒</span>
              Jugado {formatPlaytime(instance.playtime ?? 0)}
            </span>
            <span className="hero-meta-item" title="Última vez que se ejecutó">
              <span className="icon">📅</span>
              Último: {formatRelativeTime(instance.lastPlayed)}
            </span>
            <span className="hero-meta-item" title="RAM asignada">
              <span className="icon">💾</span>
              {((instance.ram ?? 2048) / 1024).toFixed(1)} GB RAM
            </span>
          </div>
        </div>
        <div className="instance-hero-actions">
          {!instance.remoteModpack && instance.lastQuarantinePath && <button
            className="btn btn-ghost"
            onClick={onRestoreQuarantine}
            title="Restaurar última cuarentena"
          >↩</button>}
          {instance.remoteModpack && <button
            className="btn btn-ghost"
            onClick={onSync}
            disabled={syncing || isThisRunning}
            title="Sincronizar modpack oficial"
          >☁</button>}
          <button
            id="btn-verify-instance"
            className="btn btn-ghost"
            onClick={onVerify}
            title="Verificar/Reparar instalación"
          >🔍</button>
          <button
            id="btn-instance-settings"
            className="btn btn-ghost"
            onClick={onSettings}
            title="Configuración de instancia"
          >⚙</button>
          <button
            id="btn-export-instance"
            className="btn btn-ghost"
            onClick={onShowExport}
            title="Hacer backup de instancia"
          >💾</button>
          <button
            id="btn-play-instance"
            className={`btn-play${isThisRunning ? ' running' : ''}${!instance.installed ? ' install' : ''}`}
            onClick={onPlay}
            disabled={syncing}
          >
            <span className="btn-play-icon">
              {syncing ? '↻' : isThisRunning ? '⏹' : instance.installed ? '▶' : '⬇'}
            </span>
            {syncing ? 'Sincronizando' : isThisRunning ? 'Detener' : instance.installed ? 'Jugar' : 'Instalar'}
          </button>
        </div>
      </div>
    </div>
  );
}
