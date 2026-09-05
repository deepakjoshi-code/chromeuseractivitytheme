/**
 * messages.js — the wire protocol between the service worker and every page
 * shell. One place, so no surface invents its own string literal.
 */

export const MSG = {
  /** page -> worker: "give me everything you have" */
  GET_STATE: 'aura/get-state',
  /** worker -> pages: broadcast after an accepted theme change */
  THEME_CHANGED: 'aura/theme-changed',
  /** page -> worker: apply a theme manually (PRD B4) */
  SET_THEME: 'aura/set-theme',
  /** page -> worker: pin / unpin (PRD B2) */
  SET_PIN: 'aura/set-pin',
  CLEAR_PIN: 'aura/clear-pin',
  /** page -> worker: "Not this" (PRD B3) */
  REJECT_CURRENT: 'aura/reject-current',
  /** page -> worker: settings mutation (PRD B6-B9) */
  UPDATE_SETTINGS: 'aura/update-settings',
  /** page -> worker: activity log (PRD B10) */
  GET_LOG: 'aura/get-log',
  CLEAR_LOG: 'aura/clear-log',
  /** page -> worker: nuke everything (PRD B11) */
  ERASE_ALL: 'aura/erase-all',
  /** worker -> content script: ambient overlay payload (PRD A7) */
  AMBIENT_UPDATE: 'aura/ambient-update'
};

/** Storage keys. Kept here so the erase-all path cannot miss one. */
export const KEYS = {
  SETTINGS: 'settings',
  ACTIVE: 'activeTheme',
  PIN: 'pin',
  LOG: 'log',
  REJECTIONS: 'rejections',
  CONTEXT: 'contextState',
  /** Incremented on erase, so in-flight writes cannot resurrect erased data. */
  EPOCH: 'epoch'
};
