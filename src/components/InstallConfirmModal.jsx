/**
 * InstallConfirmModal — Muestra el plan de instalación antes de descargar
 *
 * Recibe un ResolutionPlan y deja al usuario confirmar o cancelar.
 * Muestra: mods a instalar, dependencias, mods omitidos, conflictos y warnings.
 */
import './InstallConfirmModal.css';

export default function InstallConfirmModal({ plan, onConfirm, onCancel }) {
  if (!plan) return null;

  const { toInstall, toSkip, unresolved, conflicts, warnings } = plan;

  const mainMod  = toInstall.find(e => !e.isDep);
  const deps     = toInstall.filter(e => e.isDep);
  const hasIssues = conflicts.length > 0 || unresolved.length > 0;
  const totalSize = toInstall.reduce((sum, e) => sum + (e.mod.fileSize ?? 0), 0);

  return (
    <div className="icm-overlay" onClick={onCancel}>
      <div className="icm-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="icm-header">
          <div>
            <h2 className="icm-title">Confirmar instalación</h2>
            <p className="icm-subtitle">
              {toInstall.length === 1
                ? `1 archivo — ${formatSize(totalSize)}`
                : `${toInstall.length} archivos — ${formatSize(totalSize)} total`}
            </p>
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="icm-body">

          {/* Mod principal */}
          {mainMod && (
            <section className="icm-section">
              <div className="icm-section-label">Mod seleccionado</div>
              <ModRow entry={mainMod} />
            </section>
          )}

          {/* Dependencias */}
          {deps.length > 0 && (
            <section className="icm-section">
              <div className="icm-section-label">
                Dependencias requeridas
                <span className="icm-badge icm-badge-blue">{deps.length}</span>
              </div>
              <div className="icm-list">
                {deps.map(e => <DepRow key={e.mod.id} entry={e} />)}
              </div>
            </section>
          )}

          {/* Ya instalados */}
          {toSkip.filter(s => s.reason === 'already_installed').length > 0 && (
            <section className="icm-section">
              <div className="icm-section-label">
                Ya instalados — se omitirán
                <span className="icm-badge icm-badge-gray">
                  {toSkip.filter(s => s.reason === 'already_installed').length}
                </span>
              </div>
              <div className="icm-list">
                {toSkip.filter(s => s.reason === 'already_installed').map(s => (
                  <div key={s.projectId} className="icm-skip-row">
                    <span className="icm-skip-icon">✓</span>
                    <span className="icm-skip-id">{s.projectId}</span>
                    <span className="icm-skip-label">ya instalado</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <section className="icm-section icm-section-warn">
              <div className="icm-section-label">
                Avisos de compatibilidad
                <span className="icm-badge icm-badge-yellow">{warnings.length}</span>
              </div>
              <div className="icm-issues-list">
                {warnings.map((w, i) => (
                  <div key={i} className="icm-issue icm-issue-warn">⚠ {w}</div>
                ))}
              </div>
            </section>
          )}

          {/* Conflictos (bloqueantes) */}
          {conflicts.length > 0 && (
            <section className="icm-section icm-section-error">
              <div className="icm-section-label">
                Conflictos detectados
                <span className="icm-badge icm-badge-red">{conflicts.length}</span>
              </div>
              <div className="icm-issues-list">
                {conflicts.map((c, i) => (
                  <div key={i} className="icm-issue icm-issue-error">✕ {c}</div>
                ))}
              </div>
            </section>
          )}

          {/* Dependencias no resueltas */}
          {unresolved.length > 0 && (
            <section className="icm-section icm-section-error">
              <div className="icm-section-label">
                Dependencias no resueltas
                <span className="icm-badge icm-badge-red">{unresolved.length}</span>
              </div>
              <div className="icm-issues-list">
                {unresolved.map((u, i) => (
                  <div key={i} className="icm-issue icm-issue-error">
                    <strong>{u.projectId}</strong>: {u.reason}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="icm-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(toInstall)}
            disabled={toInstall.length === 0}
          >
            {hasIssues
              ? `Instalar de todos modos (${toInstall.length})`
              : `Instalar ${toInstall.length} archivo${toInstall.length !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  );
}

/* ─── Sub-componentes ─────────────────────────────────────────────────────── */

function ModRow({ entry }) {
  const { mod } = entry;
  return (
    <div className="icm-mod-row">
      {mod.iconUrl
        ? <img src={mod.iconUrl} alt={mod.name} className="icm-mod-icon" onError={e => { e.target.style.display = 'none'; }} />
        : <div className="icm-mod-icon-placeholder">🧩</div>
      }
      <div className="icm-mod-info">
        <div className="icm-mod-name">{mod.name}</div>
        <div className="icm-mod-meta">
          <span className="icm-tag">{mod.versionName}</span>
          {mod.loaders.length > 0 && (
            <span className="icm-tag">{mod.loaders.join(' / ')}</span>
          )}
          {mod.gameVersions.length > 0 && (
            <span className="icm-tag icm-tag-dim">
              {summarizeVersions(mod.gameVersions)}
            </span>
          )}
          <span className="icm-tag icm-tag-dim">{formatSize(mod.fileSize)}</span>
        </div>
      </div>
      <span className="icm-check-new">+ nuevo</span>
    </div>
  );
}

function DepRow({ entry }) {
  const { mod, depth } = entry;
  return (
    <div className="icm-dep-row" style={{ paddingLeft: depth > 1 ? `${(depth - 1) * 16}px` : 0 }}>
      {depth > 1 && <span className="icm-dep-indent">└</span>}
      <span className="icm-dep-name">{mod.name || mod.id}</span>
      <span className="icm-dep-ver">{mod.versionName}</span>
      <span className="icm-dep-size">{formatSize(mod.fileSize)}</span>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatSize(bytes) {
  if (!bytes) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function summarizeVersions(versions) {
  if (versions.length === 0) return '';
  if (versions.length === 1) return versions[0];
  const sorted = [...versions].sort().reverse();
  if (sorted.length <= 2) return sorted.join(', ');
  return `${sorted[0]} … ${sorted[sorted.length - 1]}`;
}
