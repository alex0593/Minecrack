// game.js — Slice de juego en ejecución, logs, descargas (activa y de Java)

export function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_DOWNLOAD':
      return { ...state, download: action.payload };

    case 'SET_GAME_RUNNING': {
      const { running, instanceId } = action.payload;
      const now = Date.now();

      // Iniciando juego: guardar timestamp y limpiar logs
      if (running) {
        return {
          ...state,
          gameRunning: true,
          gameInstanceId: instanceId ?? null,
          gameStartedAt: now,
          gameLogs: [],
        };
      }

      // Cerrando juego: calcular delta y actualizar instancia
      const startedAt = state.gameStartedAt;
      const playedInstId = state.gameInstanceId;
      let updatedInstances = state.instances;

      if (startedAt && playedInstId) {
        const playedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
        updatedInstances = state.instances.map(inst =>
          inst.id === playedInstId
            ? {
                ...inst,
                playtime: (inst.playtime || 0) + playedSec,
                lastPlayed: now,
              }
            : inst
        );
      }

      return {
        ...state,
        gameRunning: false,
        gameInstanceId: null,
        gameStartedAt: null,
        instances: updatedInstances,
      };
    }

    case 'ADD_LOG': {
      // Asegurar que cada log tenga timestamp para la consola
      const logEntry = action.payload.timestamp
        ? action.payload
        : { ...action.payload, timestamp: Date.now() };
      return { ...state, gameLogs: [...state.gameLogs.slice(-499), logEntry] };
    }

    case 'CLEAR_GAME_LOGS':
      return { ...state, gameLogs: [] };

    case 'SET_JAVA_DOWNLOAD':
      return { ...state, javaDownload: action.payload };

    case 'CLEAR_JAVA_DOWNLOAD':
      return { ...state, javaDownload: null };

    default:
      return undefined;
  }
}
