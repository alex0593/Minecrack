import { useState } from 'react';
import './StatsTab.css';
import { useStore } from '../../store';
import { LOADERS } from '../../lib/instances';
import { formatPlaytime } from '../../lib/format';

/** StatsTab — pestaña de estadísticas de la instancia y reparación del loader */
export default function StatsTab({ instance }) {
  const { dispatch } = useStore();
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');

  const canReinstallLoader = instance.loader === 'forge' || instance.loader === 'neoforge';

  async function handleReinstallLoader() {
    if (!confirm(`Esto re-descargará todas las librerías de ${instance.loader}. ¿Continuar?`)) return;
    setRepairing(true);
    setRepairStatus('Iniciando reparación…');
    try {
      const { deleteFile } = await import('../../lib/tauri');
      const { installLoader } = await import('../../lib/loaders');
      const { downloadQueue } = await import('../../lib/downloader');
      const { readFile, getLauncherDir } = await import('../../lib/tauri');
      const { LAUNCHER } = await import('../../config');

      const launcherDir = await getLauncherDir();
      const profileId = instance.loader === 'forge'
        ? instance.loaderVersion
        : `${instance.version}-${instance.loader}-${instance.loaderVersion}`;
      const profilePath = `${launcherDir}/versions/${profileId}/${profileId}.json`;

      // Cargar versionData vanilla (necesario para installLoader)
      const vanillaJson = await readFile(`${launcherDir}/versions/${instance.version}/${instance.version}.json`);
      const versionData = JSON.parse(vanillaJson);

      setRepairStatus('Borrando perfil antiguo…');
      try { await deleteFile(profilePath); } catch { /* ok si no existe */ }

      setRepairStatus(`Regenerando perfil de ${instance.loader}…`);
      const result = await installLoader(
        instance.loader, instance.loaderVersion, instance.version, launcherDir, versionData
      );

      if (result.downloadTasks?.length > 0) {
        setRepairStatus(`Descargando ${result.downloadTasks.length} archivos…`);
        await new Promise((resolve, reject) => {
          const q = downloadQueue({
            tasks: result.downloadTasks,
            concurrency: LAUNCHER.MAX_CONCURRENT_DOWNLOADS,
            onProgress: (p) => setRepairStatus(`Descargando ${p.done}/${p.total}: ${p.label}`),
            onDone: ({ failed }) => failed > 0
              ? reject(new Error(`${failed} archivos fallaron`))
              : resolve(),
          });
          q.run();
        });
      }

      setRepairStatus('✓ Reparación completada');
      setTimeout(() => { setRepairing(false); setRepairStatus(''); }, 1500);
    } catch (err) {
      console.error('[Reinstall] Error:', err);
      setRepairStatus(`✗ Error: ${err.message || err}`);
      dispatch({ type: 'SET_ERROR', payload: err.message || String(err) });
      setTimeout(() => { setRepairing(false); setRepairStatus(''); }, 3000);
    }
  }

  return (
    <div>
      <div className="stats-grid">
        {[
          { label: 'Tiempo jugado', value: formatPlaytime(instance.playtime ?? 0), accent: true },
          { label: 'Mods instalados', value: instance.mods?.length ?? 0, accent: false },
          { label: 'RAM asignada', value: `${instance.ram ?? 2048} MB`, accent: false },
          { label: 'Loader', value: LOADERS.find(l => l.id === instance.loader)?.label ?? 'Vanilla', accent: false },
          { label: 'Versión MC', value: instance.version, accent: false },
          { label: 'Creado', value: new Date(instance.createdAt).toLocaleDateString(), accent: false },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value${s.accent ? ' accent' : ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {canReinstallLoader && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            🔧 Reparación del loader
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Si tienes errores como <code>ClassNotFoundException</code> al lanzar,
            re-instala el loader para descargar archivos faltantes.
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleReinstallLoader}
            disabled={repairing}
          >
            {repairing ? '⏳ Reparando…' : `🔄 Reinstalar ${instance.loader}`}
          </button>
          {repairStatus && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              {repairStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
