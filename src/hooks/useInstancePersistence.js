// useInstancePersistence.js — Carga instancias desde disco al arrancar
// y persiste automáticamente cuando cambian.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getLauncherDir, readFile, writeFile, ensureDir } from '../lib/tauri';

export function useInstancePersistence() {
  const { state, dispatch } = useStore();
  const { instances } = state;
  const initialized = useRef(false);

  // Cargar instancias y configuración al montar
  useEffect(() => {
    (async () => {
      try {
        const launcherDir = await getLauncherDir();
        await ensureDir(launcherDir);
        
        // 1. Cargar Configuración
        try {
          const configJson = await readFile(`${launcherDir}/config.json`);
          const loadedConfig = JSON.parse(configJson);
          dispatch({ type: 'SET_CONFIG', payload: loadedConfig });
          
          if (!loadedConfig.setupCompleted) {
            dispatch({ type: 'SET_SHOW_WIZARD', payload: true });
          }
        } catch (e) {
          // Si no hay config, forzar wizard
          dispatch({ type: 'SET_SHOW_WIZARD', payload: true });
        }

        // 2. Cargar Instancias
        const json = await readFile(`${launcherDir}/instances.json`);
        const loaded = JSON.parse(json);
        if (Array.isArray(loaded) && loaded.length > 0) {
          dispatch({ type: 'SET_INSTANCES', payload: loaded });
        }
      } catch {
        // Primera vez o archivo inexistente
      } finally {
        initialized.current = true;
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir cuando cambia la lista o la config (sólo después de la carga inicial)
  useEffect(() => {
    if (!initialized.current) return;
    (async () => {
      try {
        const launcherDir = await getLauncherDir();
        
        // Guardar Instancias
        await writeFile(
          `${launcherDir}/instances.json`,
          JSON.stringify(instances, null, 2)
        );

        // Guardar Configuración
        await writeFile(
          `${launcherDir}/config.json`,
          JSON.stringify(state.config, null, 2)
        );
      } catch (err) {
        console.error('[Persistence] Error guardando datos:', err);
      }
    })();
  }, [instances, state.config]);
}
