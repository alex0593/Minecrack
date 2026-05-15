// useInstancePersistence.js — Carga instancias desde disco al arrancar
// y persiste automáticamente cuando cambian.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getLauncherDir, readFile, writeFile, ensureDir } from '../lib/tauri';

export function useInstancePersistence() {
  const { state, dispatch } = useStore();
  const { instances } = state;
  const initialized = useRef(false);

  // Cargar instancias, configuración y perfil al montar
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

        // 2. Cargar Perfil
        try {
          const profileJson = await readFile(`${launcherDir}/profile.json`);
          const loadedProfile = JSON.parse(profileJson);
          if (loadedProfile?.username) {
            dispatch({ type: 'SET_PROFILE', payload: loadedProfile });
          }
        } catch {
          // Primera vez, no hay perfil guardado
        }

        // 3. Cargar Instancias
        try {
          const json = await readFile(`${launcherDir}/instances.json`);
          const loaded = JSON.parse(json);
          if (Array.isArray(loaded) && loaded.length > 0) {
            dispatch({ type: 'SET_INSTANCES', payload: loaded });
          }
        } catch {
          // Primera vez, no hay instancias
        }
      } catch {
        // Error general
      } finally {
        initialized.current = true;
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir cuando cambia la lista, config o perfil (solo tras la carga inicial)
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
        console.error('[Persistence] Error guardando instancias/config:', err);
      }
    })();
  }, [instances, state.config]);

  // Persistir perfil por separado (para no reescribir instancias al cambiar nombre)
  useEffect(() => {
    if (!initialized.current) return;
    if (!state.profileReady) return;
    (async () => {
      try {
        const launcherDir = await getLauncherDir();
        await writeFile(
          `${launcherDir}/profile.json`,
          JSON.stringify(state.profile, null, 2)
        );
      } catch (err) {
        console.error('[Persistence] Error guardando perfil:', err);
      }
    })();
  }, [state.profile, state.profileReady]);
}
