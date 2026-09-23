import './SyncStatusBar.css';

/** SyncStatusBar — barra de progreso de la sincronización con el modpack remoto */
export default function SyncStatusBar({ progress }) {
  return (
    <div className={`ecosystem-sync ${progress.phase === 'error' ? 'error' : ''}`}>
      <div><strong>{progress.phase === 'done' ? '✓ Modpack listo' : 'Sincronización oficial'}</strong><span>{progress.label}</span></div>
      <div className="ecosystem-sync-track"><div style={{ width: `${Math.max(0, Math.min(100, progress.percent ?? 0))}%` }} /></div>
      <span>{Math.round(progress.percent ?? 0)}%</span>
    </div>
  );
}
