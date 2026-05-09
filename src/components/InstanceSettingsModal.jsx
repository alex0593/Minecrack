import { useState } from 'react';
import { useStore } from '../store';
import { getLauncherDir, writeFile } from '../lib/tauri';
import './InstanceSettingsModal.css';

export default function InstanceSettingsModal({ instanceId, onClose }) {
  const { state, dispatch } = useStore();
  const instance = state.instances.find(i => i.id === instanceId);

  const [name,    setName]    = useState(instance?.name    ?? '');
  const [ram,     setRam]     = useState(instance?.ram     ?? 2048);
  const [jvmArgs, setJvmArgs] = useState(instance?.jvmArgs ?? '');
  const [saving,  setSaving]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!instance) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = { ...instance, name: name.trim(), ram, jvmArgs };
      dispatch({ type: 'UPDATE_INSTANCE', payload: updated });

      // Persistir en disco
      const launcherDir = await getLauncherDir();
      const newInstances = state.instances.map(i =>
        i.id === instanceId ? updated : i
      );
      await writeFile(
        `${launcherDir}/instances.json`,
        JSON.stringify(newInstances, null, 2)
      );
      onClose();
    } catch (err) {
      console.error('[InstanceSettings] Error guardando:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      dispatch({ type: 'REMOVE_INSTANCE', payload: instanceId });
      const launcherDir = await getLauncherDir();
      const remaining = state.instances.filter(i => i.id !== instanceId);
      await writeFile(
        `${launcherDir}/instances.json`,
        JSON.stringify(remaining, null, 2)
      );
      onClose();
    } catch (err) {
      console.error('[InstanceSettings] Error eliminando instancia:', err);
    }
  };

  const RAM_PRESETS = [512, 1024, 2048, 4096, 6144, 8192];

  return (
    <div className="isettings-overlay" onClick={onClose}>
      <div className="isettings-modal" onClick={e => e.stopPropagation()}>

        <div className="isettings-header">
          <h2>⚙ Configuración — {instance.name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="isettings-body">

          {/* Nombre */}
          <div className="isettings-field">
            <label>Nombre de la instancia</label>
            <input
              className="isettings-input"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={48}
              placeholder="Nombre de la instancia"
            />
          </div>

          {/* RAM */}
          <div className="isettings-field">
            <label>
              Memoria RAM
              <span className="isettings-value-badge">{ram} MB</span>
            </label>
            <input
              type="range"
              className="isettings-slider"
              min={512}
              max={16384}
              step={512}
              value={ram}
              onChange={e => setRam(Number(e.target.value))}
            />
            <div className="isettings-presets">
              {RAM_PRESETS.map(p => (
                <button
                  key={p}
                  className={`isettings-preset${ram === p ? ' active' : ''}`}
                  onClick={() => setRam(p)}
                >
                  {p >= 1024 ? `${p / 1024}G` : `${p}M`}
                </button>
              ))}
            </div>
          </div>

          {/* JVM Args */}
          <div className="isettings-field">
            <label>Argumentos JVM adicionales</label>
            <textarea
              className="isettings-textarea"
              value={jvmArgs}
              onChange={e => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseZGC -Dfml.readTimeout=120"
              rows={3}
            />
            <div className="isettings-hint">
              Los argumentos se añaden al final de la JVM call, separados por espacios.
            </div>
          </div>

          {/* Info readonly */}
          <div className="isettings-info-row">
            <div className="isettings-info-item">
              <span className="isettings-info-label">Versión MC</span>
              <span className="isettings-info-val">{instance.version}</span>
            </div>
            <div className="isettings-info-item">
              <span className="isettings-info-label">Loader</span>
              <span className="isettings-info-val">{instance.loader}</span>
            </div>
            <div className="isettings-info-item">
              <span className="isettings-info-label">Creado</span>
              <span className="isettings-info-val">
                {new Date(instance.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Zona de peligro */}
          <div className="isettings-danger-zone">
            <div className="isettings-danger-title">Zona de peligro</div>
            {confirmDelete ? (
              <div className="isettings-confirm-delete">
                <span>¿Eliminar "{instance.name}"? Esta acción no se puede deshacer.</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                    Sí, eliminar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmDelete(true)}
              >
                🗑 Eliminar instancia
              </button>
            )}
          </div>
        </div>

        <div className="isettings-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </div>

      </div>
    </div>
  );
}
