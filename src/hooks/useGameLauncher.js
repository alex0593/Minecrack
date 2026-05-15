// useGameLauncher.js — Custom hook para el lanzamiento del juego
import { useEffect } from 'react';
import { useStore } from '../store';
import { launchGameInstance, listenGameEvents } from '../lib/launcher';
import { readFile, getLauncherDir, tauriListen } from '../lib/tauri';
import { generateOfflineUUID } from '../lib/instances';

export function useGameLauncher() {
  const { state, dispatch } = useStore();
  const { gameRunning, gameInstanceId, instances, profile } = state;

  useEffect(() => {
    if (!gameRunning || !gameInstanceId) return;

    const instance = instances.find(i => i.id === gameInstanceId);
    if (!instance) {
      dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
      return;
    }

    if (!instance.installed) {
      dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
      return;
    }

    (async () => {
      let unlistenJava;
      try {
        const launcherDir = await getLauncherDir();
        const versionPath = `${launcherDir}/versions/${instance.version}/${instance.version}.json`;
        const versionJsonStr = await readFile(versionPath);

        if (!versionJsonStr || versionJsonStr.trim() === '') {
          throw new Error(`El archivo de versión está vacío: ${versionPath}`);
        }

        const versionData = JSON.parse(versionJsonStr);
        const username = profile.username?.trim() || 'Player';
        const safeProfile = {
          username,
          uuid: profile.uuid || generateOfflineUUID(username),
          // Skin info para CustomSkinLoader
          skin: profile.skinBase64 || profile.skin || null,
          skinSource: profile.skinSource || 'none',
        };

        // Escuchar progreso de descarga de Java
        unlistenJava = await tauriListen('java://progress', (payload) => {
          dispatch({ type: 'SET_JAVA_DOWNLOAD', payload });
        });

        const unsubscribeGame = listenGameEvents(
          (log) => dispatch({ type: 'ADD_LOG', payload: log }),
          ()    => dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } })
        );

        await launchGameInstance({
          instance,
          profile: safeProfile,
          launcherDir,
          versionData,
          onJavaProgress: (info) => {
            if (info.phase === 'start') {
              dispatch({ type: 'SET_JAVA_DOWNLOAD', payload: {
                phase: 'Iniciando descarga...', percent: 0,
                label: `Descargando Java ${info.requiredMajor}...`,
                requiredMajor: info.requiredMajor,
              }});
            } else if (info.phase === 'done') {
              dispatch({ type: 'CLEAR_JAVA_DOWNLOAD' });
            }
          },
          onRepairProgress: (info) => {
            if (info.phase === 'done') {
              dispatch({ type: 'CLEAR_JAVA_DOWNLOAD' });
            } else {
              dispatch({ type: 'SET_JAVA_DOWNLOAD', payload: {
                phase: 'Reparando instalación',
                percent: info.percent ?? 0,
                label: info.label || 'Reparando perfil del loader…',
              }});
            }
          },
        });

        dispatch({ type: 'CLEAR_JAVA_DOWNLOAD' });
        unsubscribeGame();

      } catch (error) {
        console.error('[Launcher Error]', error);
        dispatch({ type: 'SET_GAME_RUNNING', payload: { running: false } });
        dispatch({ type: 'CLEAR_JAVA_DOWNLOAD' });
        const msg = error?.message ?? (typeof error === 'string' ? error : JSON.stringify(error));
        dispatch({ type: 'SET_ERROR', payload: msg });
      } finally {
        unlistenJava?.();
      }
    })();

  }, [gameRunning, gameInstanceId, instances, profile, dispatch]);
}
