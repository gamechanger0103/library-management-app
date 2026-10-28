/* ============================================================
   utils.js — tiny helpers used across the game
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deterministic PRNG (mulberry32) so levels are identical on every device. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** "01:23" style clock. */
export function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Local YYYY-MM-DD key. */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function dayIndexFromKey(key) {
  const n = dayNumber(key);
  return ((n % 7) + 7) % 7;
}

export const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/** Build an element quickly. */
export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export function formatNum(n) {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/** rAF based frame timer, capped so tab-switches don't produce huge deltas. */
export function rafLoop(cb) {
  let last = performance.now();
  let id = 0;
  const tick = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    cb(dt, now);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

export function starsRow(n, max = 3) {
  let out = '';
  for (let i = 0; i < max; i++) out += `<span class="${i < n ? '' : 'off'}">★</span>`;
  return out;
}
