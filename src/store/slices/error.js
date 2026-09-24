// error.js — Slice de error global (SET_ERROR, CLEAR_ERROR)

export function errorReducer(state, action) {
  switch (action.type) {
    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };

    default:
      return undefined;
  }
}
