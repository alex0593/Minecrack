// session.js — Slice de sesión y UI (perfil, pestaña, modales, modo import de modpack)

export function sessionReducer(state, action) {
  switch (action.type) {
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

    default:
      return undefined;
  }
}
