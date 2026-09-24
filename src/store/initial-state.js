// initial-state.js — Estado inicial literal del store (sin React, sin side effects)
export const initialState = {
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
