import { useState, useEffect } from 'react';
import './VerifyInstanceModal.css';
import { verifyInstance, getRepairTasks, getLauncherDir, downloadFile, tauriListen } from '../lib/tauri';
import { useStore } from '../store';

export default function VerifyInstanceModal({ instanceId, onClose }) {
  const { state, dispatch } = useStore();
  const instance = state.instances.find(i => i.id === instanceId);
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState(null);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState({ current: 0, total: 0, label: '' });

  useEffect(() => {
    handleVerify();
  }, []);

  const handleVerify = async () => {
    try {
      setLoading(true);
      const launcherDir = await getLauncherDir();
      const result = await verifyInstance(launcherDir, instanceId);
      setVerification(result);
    } catch (err) {
      console.error('[VerifyInstanceModal] Error:', err);
      alert(`❌ Error verificando instancia: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRepair = async () => {
    try {
      setRepairing(true);
      setRepairProgress({ current: 0, total: 0, label: 'Preparando reparación...' });
      const launcherDir = await getLauncherDir();
      const tasks = await getRepairTasks(launcherDir, instanceId, true);

      if (tasks.length === 0) {
        alert('✅ La instancia está correcta, no hay nada que reparar');
        setRepairing(false);
        return;
      }

      setRepairProgress({ current: 0, total: tasks.length, label: 'Iniciando descarga...' });

      // Escuchar progreso de descarga una sola vez
      const unlistenProgress = await tauriListen('download://progress', (progress) => {
        setRepairProgress(prev => ({
          ...prev,
          label: `${progress.file} - ${Math.round(progress.percent ?? 0)}%`,
        }));
      });

      let completed = 0;
      for (const task of tasks) {
        setRepairProgress({
          current: completed,
          total: tasks.length,
          label: task.label,
        });

        try {
          await downloadFile(task.url, task.dest, task.sha1, task.label);
          completed++;
        } catch (err) {
          console.error(`[VerifyInstanceModal] Error descargando ${task.label}:`, err);
          unlistenProgress();
          alert(`❌ Error descargando ${task.label}: ${err.message}`);
          setRepairing(false);
          return;
        }
      }

      unlistenProgress();
      setRepairProgress({ current: tasks.length, total: tasks.length, label: 'Reparación completada' });
      alert(`✅ Instancia reparada correctamente (${tasks.length} archivos)`);

      // Volver a verificar
      setTimeout(() => {
        handleVerify();
        setRepairing(false);
      }, 1500);
    } catch (err) {
      console.error('[VerifyInstanceModal] Error reparando:', err);
      alert(`❌ Error reparando: ${err.message}`);
      setRepairing(false);
    }
  };

  if (!instance) return null;

  const statusIcon = verification?.status === 'ok' ? '✅' : verification?.status === 'corrupted' ? '⚠️' : '❌';
  const statusText = {
    ok: 'Instancia correcta',
    incomplete: 'Archivos faltantes',
    corrupted: 'Archivos corruptos',
  }[verification?.status] ?? 'Verificando...';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content verify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Verificar / Reparar</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
              {instance.name}
            </p>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={repairing}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🔍</div>
            <p>Verificando integridad de archivos...</p>
          </div>
        ) : repairing ? (
          <div style={{ padding: '40px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 28 }}>🔧</span>
              <div>
                <div style={{ fontWeight: 600 }}>Reparando instancia</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {repairProgress.current} de {repairProgress.total} archivos
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-sm)',
              height: 8,
              overflow: 'hidden',
              marginBottom: 12,
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
                width: `${(repairProgress.current / repairProgress.total) * 100}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {repairProgress.label}
            </div>
          </div>
        ) : verification ? (
          <div style={{ padding: '0 24px 24px' }}>
            {/* Status */}
            <div style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{ fontSize: 28 }}>{statusIcon}</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{statusText}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {verification.total} archivos ({verification.missing.length} faltantes, {verification.corrupt.length} corruptos)
                </div>
              </div>
            </div>

            {/* Missing Files */}
            {verification.missing.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  ❌ ARCHIVOS FALTANTES ({verification.missing.length})
                </h4>
                <div style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}>
                  {verification.missing.map((file, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        borderBottom: i < verification.missing.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{file.label}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, wordBreak: 'break-all' }}>
                        {file.path}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Corrupt Files */}
            {verification.corrupt.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  ⚠️ ARCHIVOS CORRUPTOS ({verification.corrupt.length})
                </h4>
                <div style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}>
                  {verification.corrupt.map((file, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        borderBottom: i < verification.corrupt.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{file.label}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, wordBreak: 'break-all' }}>
                        {file.path}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verification.status === 'ok' && (
              <div style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 16,
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}>
                ✅ La instancia está en perfecto estado. No hay nada que reparar.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleVerify}
                disabled={loading}
              >
                🔄 Verificar de nuevo
              </button>
              {verification.status !== 'ok' && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRepair}
                  disabled={loading}
                >
                  🔧 Reparar ({verification.missing.length + verification.corrupt.length})
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-ghost btn-sm"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
