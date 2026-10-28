/* ============================================================
   haptics.js — vibration patterns (silently ignored where unsupported)
   ============================================================ */

import { store } from './storage.js';

const PATTERNS = {
  tap: 8,
  escape: 10,
  blocked: [0, 18, 45, 22],
  power: [0, 12],
  win: [0, 16, 55, 16, 55, 40],
  lose: [0, 34, 60, 34],
  coin: [0, 10, 40, 10],
  star: [0, 14, 40, 14],
};

function supported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function haptic(name) {
  if (!store.settings.haptics || !supported()) return;
  const p = PATTERNS[name];
  if (p == null) return;
  try {
    navigator.vibrate(p);
  } catch (e) {
    /* noop */
  }
}

export const canVibrate = supported;
