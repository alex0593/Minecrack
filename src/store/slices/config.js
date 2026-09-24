// config.js — Slice de configuración global (SET_CONFIG, UPDATE_CONFIG, SET_SHOW_WIZARD)

export function configReducer(state, action) {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: action.payload };

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    case 'SET_SHOW_WIZARD':
      return { ...state, showSetupWizard: action.payload };

    default:
      return undefined;
  }
}
