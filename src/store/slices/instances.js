// instances.js — Slice de instancias y su selección/mods/packs/shaders asociados

export function instancesReducer(state, action) {
  switch (action.type) {
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

    default:
      return undefined;
  }
}
