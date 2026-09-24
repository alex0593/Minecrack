// reducer.js — Combina los slices del store en un único reducer raíz.
// Patrón: cada slice devuelve `undefined` cuando NO maneja la acción y su
// resultado original cuando sí la maneja; el raíz devuelve el primer
// resultado !== undefined, y `state` si ningún slice respondió
// (equivalente al `default: return state` del switch original).
// Las acciones son disjuntas entre slices, así que solo uno responde por acción.

import { configReducer } from './slices/config';
import { instancesReducer } from './slices/instances';
import { sessionReducer } from './slices/session';
import { gameReducer } from './slices/game';
import { errorReducer } from './slices/error';

// Orden de referencia: sigue el orden de casos del reducer original.
const slices = [
  configReducer,
  instancesReducer,
  sessionReducer,
  gameReducer,
  errorReducer,
];

export function reducer(state, action) {
  for (const slice of slices) {
    const result = slice(state, action);
    if (result !== undefined) {
      return result;
    }
  }
  return state;
}
