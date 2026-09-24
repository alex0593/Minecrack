import { useState, useEffect } from 'react';
import Skeleton from '../ui/Skeleton';
import { useStore } from '../../store';
import {
  getLauncherDir,
  listResourcePacks, addResourcePack, deleteResourcePack,
  listShaderPacks, addShaderPack, deleteShaderPack,
  pickFile,
} from '../../lib/tauri';

/** PacksTab — pestaña de Resource Packs / Shaderpacks de la instancia */
export default function PacksTab({ instance, type }) {
  const [loading, setLoading] = useState(false);
  const { state, dispatch, openModal } = useStore();

  const listFn    = type === 'resourcepacks' ? listResourcePacks : listShaderPacks;
  const addFn     = type === 'resourcepacks' ? addResourcePack   : addShaderPack;
  const deleteFn  = type === 'resourcepacks' ? deleteResourcePack : deleteShaderPack;
  const label     = type === 'resourcepacks' ? 'Resource Packs' : 'Shaderpacks';
  const icon      = type === 'resourcepacks' ? '🎨' : '✨';
  const modalName = type === 'resourcepacks' ? 'resourcePackBrowser' : 'shaderPackBrowser';
  const storeKey  = type === 'resourcepacks' ? 'SET_INSTANCE_RESOURCE_PACKS' : 'SET_INSTANCE_SHADERPACKS';

  const packs = type === 'resourcepacks' ? state.instanceResourcePacks : state.instanceShaderpacks;

  const load = async () => {
    setLoading(true);
    try {
      const dir = await getLauncherDir();
      const list = await listFn(dir, instance.id);
      dispatch({ type: storeKey, payload: list });
    } catch (err) {
      console.error(`[PacksTab] Error cargando ${label}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [instance.id]);

  const handleAdd = async () => {
    try {
      const filePath = await pickFile({
        title: `Seleccionar ${label}`,
        filters: [{ name: 'Pack (ZIP)', extensions: ['zip'] }],
      });
      if (!filePath) return;
      const dir = await getLauncherDir();
      await addFn(dir, instance.id, filePath);
      await load();
    } catch (err) {
      console.error(`[PacksTab] Error agregando:`, err);
    }
  };

  const handleDelete = async (filename) => {
    try {
      const dir = await getLauncherDir();
      await deleteFn(dir, instance.id, filename);
      await load();
    } catch (err) {
      console.error(`[PacksTab] Error eliminando:`, err);
    }
  };

  const handleSearchOnline = () => {
    openModal(modalName, { instanceId: instance.id });
  };

  return (
    <div>
      <div className="mods-header">
        <h3>{icon} {label} ({packs.length})</h3>
        <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSearchOnline} disabled={loading}>
            🔍 Buscar en línea
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={loading}>
            + Agregar local
          </button>
        </div>
      </div>
      {loading && packs.length === 0 ? (
        <div className="packs-loading" role="status" aria-live="polite">
          <span className="panel-sr-only">Cargando {label}...</span>
          <Skeleton lines={3} height={64} radius={10} />
        </div>
      ) : packs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">{icon}</div>
          <h3 className="empty-state-title">Sin {label.toLowerCase()}</h3>
          <p className="empty-state-desc">
            Agrega {type === 'resourcepacks' ? 'texture packs o resource packs' : 'shaders (Iris/OptiFine)'} en formato ZIP.
          </p>
          <button className="empty-state-cta empty-state-cta-primary" onClick={handleAdd}>
            {icon} Agregar {label}
          </button>
        </div>
      ) : (
        <div className="mods-list" style={{ marginTop: 'var(--gap-md)' }}>
          {packs.map(pack => (
            <div key={pack.filename} className="mod-row">
              <div className="mod-row-icon">{icon}</div>
              <div className="mod-row-info">
                <div className="mod-row-name">{pack.name}</div>
                <div className="mod-row-version">{pack.filename}</div>
              </div>
              <div className="mod-row-actions">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(pack.filename)}
                >✕ Quitar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
