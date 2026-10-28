/* ============================================================
   storage.js — local save profile (works offline, no backend)
   ============================================================ */

const KEY = 'arrowEscape.profile.v1';

export const DEFAULT_PROFILE = {
  v: 1,
  createdAt: null,
  lastPlayed: null,
  current: 1,
  coins: 0,
  stars: {}, // level -> 1..3
  bestScore: 0,
  highscores: [], // { score, level, stars, mode, at }
  streak: { count: 0, best: 0, lastDay: null },
  rewards: { lastClaimDay: null, index: 0 }, // 7 day login calendar
  daily: { day: null, best: 0, cleared: false, attempts: 0 },
  achievements: {}, // id -> dayKey unlocked
  settings: {
    sound: true,
    music: true,
    haptics: true,
    theme: 'dark',
    timer: true,
  },
  stats: {
    plays: 0,
    cleared: 0,
    perfects: 0,
    escapes: 0,
    blocked: 0,
    hints: 0,
    undos: 0,
    shuffles: 0,
    livesBought: 0,
    noHintClears: 0,
    challenges: 0,
    bestCombo: 0,
    totalTime: 0,
    dailyCleared: 0,
    levelsByDiff: { easy: 0, medium: 0, hard: 0, expert: 0 },
  },
  seenHowto: false,
};

/** structuredClone with a JSON fallback for older browsers */
const clone = (obj) =>
  typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

function deepMerge(base, patch) {
  if (patch == null || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(patch)) {
    const b = base[k];
    const p = patch[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && p && typeof p === 'object') {
      out[k] = deepMerge(b, p);
    } else if (p !== undefined) {
      out[k] = p;
    }
  }
  return out;
}

class Store {
  constructor() {
    this.data = this.read();
    this._pending = false;
    this._onError = null;
  }

  read() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      /* private mode / blocked storage */
    }
    if (!raw) return clone(DEFAULT_PROFILE);
    try {
      const parsed = JSON.parse(raw);
      return deepMerge(clone(DEFAULT_PROFILE), parsed);
    } catch (e) {
      return clone(DEFAULT_PROFILE);
    }
  }

  save() {
    this._pending = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      if (this._onError) this._onError(e);
    }
  }

  /** batched save (cheap, but avoid writing on every frame) */
  touch() {
    if (this._pending) return;
    this._pending = true;
    setTimeout(() => this.save(), 220);
  }

  reset() {
    this.data = clone(DEFAULT_PROFILE);
    this.save();
  }

  get settings() {
    return this.data.settings;
  }
}

export const store = new Store();
