// useInstancePersistence.js — Carga instancias desde disco al arrancar
// y persiste automáticamente cuando cambian.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getLauncherDir, readFile, writeFile, ensureDir } from '../lib/tauri';

export function useInstancePersistence() {
  const { state, dispatch } = useStore();
  const { instances } = state;
  const initialized = useRef(false);

  // Cargar instancias al montar
  useEffect(() => {
    (async () => {
      try {
        const launcherDir = await getLauncherDir();
        await ensureDir(launcherDir);
        const json = await readFile(`${launcherDir}/instances.json`);
        const loaded = JSON.parse(json);
        if (Array.isArray(loaded) && loaded.length > 0) {
          dispatch({ type: 'SET_INSTANCES', payload: loaded });
        }
      } catch {
        // Primera vez o archivo inexistente — estado vacío está bien
      } finally {
        initialized.current = true;
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir cuando cambia la lista (sólo después de la carga inicial)
  useEffect(() => {
    if (!initialized.current) return;
    (async () => {
      try {
        const launcherDir = await getLauncherDir();
        await writeFile(
          `${launcherDir}/instances.json`,
          JSON.stringify(instances, null, 2)
        );
      } catch (err) {
        console.error('[Persistence] Error guardando instancias:', err);
      }
    })();
  }, [instances]);
}
