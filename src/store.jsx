// store.jsx — Estado global centralizado con React Context + split contexts (P4 optimization)
import { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react';

const initialState = {
  // Instancias
  instances: [],
  selectedInstanceId: null,
  instanceMods: [],         // Mods de la instancia seleccionada
  instanceResourcePacks: [], // Resource packs de la instancia seleccionada
  instanceShaderpacks: [],   // Shaderpacks de la instancia seleccionada

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
      return {
        ...state,
        selectedInstanceId: action.payload,
        instanceMods: [],
        instanceResourcePacks: [],
        instanceShaderpacks: [],
      };

    case 'SET_INSTANCE_MODS':
      return { ...state, instanceMods: action.payload };

    case 'SET_INSTANCE_RESOURCE_PACKS':
      return { ...state, instanceResourcePacks: action.payload };

    case 'SET_INSTANCE_SHADERPACKS':
      return { ...state, instanceShaderpacks: action.payload };

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

// ─────────────────────────────────────────────────────────────────────────────
// P4 Optimization: Split contexts to prevent unnecessary re-renders
// StateContext: for consumers that need to read state
// DispatchContext: for dispatch-only consumers (openModal, closeModal, dispatch)
// ─────────────────────────────────────────────────────────────────────────────
const StateContext = createContext(null);
const DispatchContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ─── Fix openModal identity issue (P4) ──────────────────────────────────────
  // Previously: openModal was useCallback(fn, [state.modal]) — identity churned on
  // every modal change, dirtying DispatchContext. Fix: read state.modal via useRef,
  // making openModal useCallback(..., []) — session-stable.
  const stateRef = useRef(state);
  stateRef.current = state; // Update ref each render without breaking deps

  const openModal = useCallback((name, data) => {
    // Auto-close any existing modal before opening a new one
    if (stateRef.current.modal) {
      dispatch({ type: 'CLOSE_MODAL' });
    }
    dispatch({ type: 'OPEN_MODAL', payload: { name, data } });
  }, []); // Empty deps: identity stable across renders

  const closeModal = useCallback(() =>
    dispatch({ type: 'CLOSE_MODAL' }), []);

  // Memoize dispatch value to prevent DispatchContext updates on state changes
  const dispatchValue = useMemo(
    () => ({ dispatch, openModal, closeModal }),
    [openModal, closeModal]
  );

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatchValue}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

/**
 * Read-only state hook. Use this when you only need to read state.
 * Components that also dispatch should use useStore() for backward compat,
 * or useStoreState() + useDispatch() separately.
 */
export function useStoreState() {
  const state = useContext(StateContext);
  if (!state) throw new Error('useStoreState must be used inside StoreProvider');
  return state;
}

/**
 * Dispatch-only hook. Use this for components that only dispatch actions.
 * Returns { dispatch, openModal, closeModal } — session-stable identity.
 */
export function useDispatch() {
  const dispatchCtx = useContext(DispatchContext);
  if (!dispatchCtx) throw new Error('useDispatch must be used inside StoreProvider');
  return dispatchCtx;
}

/**
 * Backward-compatibility hook. Returns { state, dispatch, openModal, closeModal }.
 * For new code, prefer useStoreState() + useDispatch() to optimize re-renders.
 */
export function useStore() {
  const state = useContext(StateContext);
  const dispatchCtx = useContext(DispatchContext);
  if (!state || !dispatchCtx) throw new Error('useStore must be used inside StoreProvider');
  return { state, ...dispatchCtx };
}
