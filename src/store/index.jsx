// store/index.jsx — Estado global centralizado con React Context + split contexts (P4 optimization)
// Punto de entrada del store: los slices viven en ./slices y el combinador en ./reducer.
import { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react';

import { reducer } from './reducer';
import { initialState } from './initial-state';

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
