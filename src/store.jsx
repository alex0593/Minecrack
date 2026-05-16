// store.js — Estado global centralizado con React Context
import { createContext, useContext, useReducer, useCallback } from 'react';

const initialState = {
  // Instancias
  instances: [],
  selectedInstanceId: null,
  instanceMods: [],         // Mods de la instancia seleccionada

  // Perfil offline
  profile: {
    username: '',
    uuid: null,
    skin: null,  // Ruta a archivo PNG o data URL de skin
  },
  profileReady: false,

  // UI
  activeTab: 'instances',   // 'instances' | 'mods' | 'settings'
  modal: null,              // null | 'newInstance' | 'profile' | 'modBrowser' | 'instanceSettings'
  modalData: null,
  modpackImportMode: false, // true cuando se está importando un modpack

  // Descarga activa
  download: null,           // null | { label, progress, total }

  // Juego corriendo
  gameRunning: false,
  gameInstanceId: null,
  gameStartedAt: null,      // ms epoch — para calcular delta de playtime al cerrar
  gameLogs: [],

  // Configuración global
  config: {
    setupCompleted: false,
    javaPath: null,
    gameDir: null,
    theme: 'dark',
  },
  showSetupWizard: false,

  // Error global (para mostrar en modal copiable)
  errorMessage: null,

  // Descarga de Java en progreso
  javaDownload: null,  // null | { phase, percent, label, requiredMajor }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: action.payload };

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    case 'SET_SHOW_WIZARD':
      return { ...state, showSetupWizard: action.payload };
    case 'SET_INSTANCES':
      return { ...state, instances: action.payload };

    case 'ADD_INSTANCE':
      return { ...state, instances: [...state.instances, action.payload] };

    case 'REMOVE_INSTANCE':
      return {
        ...state,
        instances: state.instances.filter(i => i.id !== action.payload),
        selectedInstanceId: state.selectedInstanceId === action.payload ? null : state.selectedInstanceId,
      };

    case 'UPDATE_INSTANCE':
      return {
        ...state,
        instances: state.instances.map(i =>
          i.id === action.payload.id ? { ...i, ...action.payload } : i
        ),
      };

    case 'SELECT_INSTANCE':
      return { ...state, selectedInstanceId: action.payload, instanceMods: [] };

    case 'SET_INSTANCE_MODS':
      return { ...state, instanceMods: action.payload };

    case 'SET_PROFILE':
      return { ...state, profile: action.payload, profileReady: true };

    case 'SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'OPEN_MODAL':
      return { ...state, modal: action.payload.name, modalData: action.payload.data ?? null };

    case 'CLOSE_MODAL':
      return { ...state, modal: null, modalData: null };

    case 'SET_MODPACK_IMPORT_MODE':
      return { ...state, modpackImportMode: action.payload };

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

    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };

    case 'SET_JAVA_DOWNLOAD':
      return { ...state, javaDownload: action.payload };

    case 'CLEAR_JAVA_DOWNLOAD':
      return { ...state, javaDownload: null };

    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const openModal = useCallback((name, data) => {
    // Auto-close any existing modal before opening a new one
    if (state.modal) {
      dispatch({ type: 'CLOSE_MODAL' });
    }
    dispatch({ type: 'OPEN_MODAL', payload: { name, data } });
  }, [state.modal]);

  const closeModal = useCallback(() =>
    dispatch({ type: 'CLOSE_MODAL' }), []);

  return (
    <StoreContext.Provider value={{ state, dispatch, openModal, closeModal }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
