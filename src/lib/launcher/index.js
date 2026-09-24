// index.js — Barrel for src/lib/launcher (formerly a single launcher.js file)

import { launchGameInstance } from './launch';
import { listenGameEvents } from './events';

export { launchGameInstance, listenGameEvents };

export default {
  launchGameInstance,
  listenGameEvents,
};
