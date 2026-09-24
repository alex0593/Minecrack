// events.js — Game event listeners (split out of launcher.js)

import { tauriListen } from '../tauri';

/**
 * Event listeners for game logging and termination
 */
export function listenGameEvents(onLog, onStopped) {
  let unlistenLog;
  let unlistenStopped;

  tauriListen('game://log', (payload) => {
    onLog(payload);
  }).then(fn => { unlistenLog = fn; });

  tauriListen('game://stopped', (exitCode) => {
    onStopped(exitCode);
  }).then(fn => { unlistenStopped = fn; });

  return () => {
    unlistenLog?.();
    unlistenStopped?.();
  };
}
