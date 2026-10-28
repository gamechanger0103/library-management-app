/* ============================================================
   levels.js — procedural puzzle generation + level tuning
   ------------------------------------------------------------
   Board model
   -----------
   Every cell holds one arrow. Tapping an arrow sends it flying in
   the direction it points; it escapes only when the straight line
   it travels is free of other arrows. Escaped arrows never block
   anything, so the board can never become unsolvable: at any time
   at least one arrow has a clear runway.

   Levels are generated "forwards": start from a full board, then
   repeatedly pick a cell whose runway (in one of the 4 directions)
   is clear, give it that direction and remove it. The removal
   order is therefore a guaranteed solution — perfect for hints.
   ============================================================ */

import { mulberry32, hashString } from './utils.js';

export const TOTAL_LEVELS = 520;
export const LEVELS_PER_CHAPTER = 10;
export const CHAPTER_COUNT = TOTAL_LEVELS / LEVELS_PER_CHAPTER;

/** up, right, down, left */
export const DIR_VECTORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

export const DIFFICULTY_META = {
  easy: { label: 'Easy', hint: 'Learn the runway', accent: '#22d3ee' },
  medium: { label: 'Medium', hint: 'Watch the lanes', accent: '#a78bfa' },
  hard: { label: 'Hard', hint: 'Think two moves ahead', accent: '#fb7185' },
  expert: { label: 'Expert', hint: 'Crowded board, sharp eyes', accent: '#fbbf24' },
};

const PREFIX = ['Ember', 'Neon', 'Void', 'Prism', 'Cobalt', 'Frost', 'Solar', 'Echo', 'Onyx', 'Lumen', 'Tidal', 'Quartz', 'Nova'];
const SUFFIX = ['Gate', 'Drift', 'Spire', 'Circuit'];

export function chapterInfo(chapter) {
  const i = chapter - 1;
  return {
    index: chapter,
    name: `${PREFIX[i % PREFIX.length]} ${SUFFIX[Math.floor(i / PREFIX.length) % SUFFIX.length]}`,
  };
}

/* ------------------------------------------------------------------
   tuning
   ------------------------------------------------------------------ */

export function tunings(level) {
  const inChapter = (level - 1) % LEVELS_PER_CHAPTER; // 0..9
  const chapter = Math.ceil(level / LEVELS_PER_CHAPTER);
  const challenge = inChapter === LEVELS_PER_CHAPTER - 1;

  let diff;
  let size;
  let lives;
  let blocks;

  if (level <= 3) {
    diff = 'easy';
    size = 4;
    lives = 6;
    blocks = 0;
  } else if (level <= 20) {
    diff = 'easy';
    size = 5;
    lives = 5;
    blocks = 1;
  } else if (level <= 60) {
    diff = 'medium';
    size = 5;
    lives = 4;
    blocks = 2;
  } else if (level <= 140) {
    diff = 'hard';
    size = 6;
    lives = 3;
    blocks = 3;
  } else {
    diff = 'expert';
    size = level <= 260 ? 6 : 7;
    lives = 3;
    blocks = 4;
  }

  if (challenge) {
    size = Math.min(size + 1, 8);
    lives = Math.max(3, lives - 1);
    blocks += 1;
  }

  // slightly lighter boards right after a difficulty jump
  if (level === 21 || level === 61 || level === 141) lives += 1;

  return { diff, size, lives, blocks, challenge, chapter, inChapter };
}

/* ------------------------------------------------------------------
   generation
   ------------------------------------------------------------------ */

const laneOf = (dir, r, c) => (dir === 0 || dir === 2 ? c % 3 : r % 3);

/**
 * Build a solvable board.
 * @returns {{dirs: Uint8Array, order: number[], freeCount: number}}
 */
export function generateBoard(size, rng) {
  const n = size * size;
  const dirs = new Uint8Array(n);
  const alive = new Uint8Array(n).fill(1);
  const lanes = [];
  for (let i = 0; i < 12; i++) lanes.push(new Uint8Array(n));

  const freeDirsOf = (cell) => {
    const r = (cell / size) | 0;
    const c = cell % size;
    const out = [];
    for (let d = 0; d < 4; d++) {
      const lane = lanes[d * 3 + laneOf(d, r, c)];
      let blocked = false;
      if (d === 0) {
        for (let rr = r - 1; rr >= 0; rr--) if (lane[rr * size + c]) { blocked = true; break; }
      } else if (d === 2) {
        for (let rr = r + 1; rr < size; rr++) if (lane[rr * size + c]) { blocked = true; break; }
      } else if (d === 1) {
        for (let cc = c + 1; cc < size; cc++) if (lane[r * size + cc]) { blocked = true; break; }
      } else {
        for (let cc = c - 1; cc >= 0; cc--) if (lane[r * size + cc]) { blocked = true; break; }
      }
      if (!blocked) out.push(d);
    }
    return out;
  };

  const occupy = (cell) => {
    const r = (cell / size) | 0;
    const c = cell % size;
    for (let d = 0; d < 4; d++) lanes[d * 3 + laneOf(d, r, c)][cell] = 1;
  };
  const vacate = (cell) => {
    const r = (cell / size) | 0;
    const c = cell % size;
    for (let d = 0; d < 4; d++) lanes[d * 3 + laneOf(d, r, c)][cell] = 0;
  };

  // initialise: everything occupied
  for (let cell = 0; cell < n; cell++) occupy(cell);

  const order = [];
  let remaining = n;
  let freeAtStart = 0;
  let guard = n * 8;

  while (remaining > 0 && guard-- > 0) {
    const candidates = [];
    for (let cell = 0; cell < n; cell++) {
      if (!alive[cell]) continue;
      const fd = freeDirsOf(cell);
      if (fd.length) candidates.push(cell, fd);
    }
    const count = candidates.length / 2;
    if (!count) break; // cannot happen on a full rectangular board
    if (remaining === n) freeAtStart = count;

    const pick = (rng() * count) | 0;
    const cell = candidates[pick * 2];
    const fd = candidates[pick * 2 + 1];

    // prefer a runway that is long, it looks nicer when it flies out
    const dir = fd.length > 1 && rng() < 0.45 ? fd[(rng() * fd.length) | 0] : fd[0];

    dirs[cell] = dir;
    order.push(cell);
    vacate(cell);
    alive[cell] = 0;
    remaining--;
  }

  return { dirs, order, freeCount: freeAtStart };
}

/**
 * Largest share of arrows that may be free on the first move.
 * Lower = more of the board is tangled at the start = harder.
 */
const MAX_START_FREE = { easy: 0.62, medium: 0.5, hard: 0.4, expert: 0.34 };

function buildPuzzle(size, diff, seed, attempts = 9) {
  let best = null;
  for (let i = 0; i < attempts; i++) {
    const rng = mulberry32((seed + i * 7919) >>> 0);
    const b = generateBoard(size, rng);
    const ratio = b.freeCount / (size * size);
    b.ratio = ratio;
    const limit = MAX_START_FREE[diff] ?? 0.5;
    const isGood = b.freeCount >= 2 && ratio <= limit && b.order.length === size * size;
    if (isGood) return b;
    if (!best || b.ratio < best.ratio) best = b;
  }
  return best;
}

/* ------------------------------------------------------------------
   level definitions
   ------------------------------------------------------------------ */

const cache = new Map();

export function getLevel(level) {
  const id = `L${level}`;
  if (cache.has(id)) return cache.get(id);
  const t = tunings(level);
  const seed = hashString(`arrow-escape::${level}`);
  const board = buildPuzzle(t.size, t.diff, seed);
  const arrows = t.size * t.size;
  const par = Math.round(arrows * 3.2 + 8);
  const timed = t.diff === 'hard' || t.diff === 'expert' || t.challenge;

  const def = {
    id,
    kind: 'level',
    level,
    chapter: t.chapter,
    difficulty: t.diff,
    size: t.size,
    rows: t.size,
    cols: t.size,
    dirs: board.dirs,
    order: board.order,
    arrows,
    lives: t.lives,
    blocks: t.blocks,
    challenge: t.challenge,
    seed,
    par,
    timeLimit: timed ? Math.round(par * 2.3) : 0,
  };
  cache.set(id, def);
  return def;
}

export function getDaily(dayKeyString) {
  const seed = hashString(`arrow-escape-daily::${dayKeyString}`);
  const rng = mulberry32(seed);
  const size = rng() < 0.5 ? 6 : 7;
  const diff = size === 7 ? 'expert' : 'hard';
  const board = buildPuzzle(size, diff, seed);
  const arrows = size * size;
  const par = Math.round(arrows * 3 + 10);
  return {
    id: 'DAILY',
    kind: 'daily',
    level: 0,
    day: dayKeyString,
    chapter: 0,
    difficulty: diff,
    size,
    rows: size,
    cols: size,
    dirs: board.dirs,
    order: board.order,
    arrows,
    lives: 3,
    blocks: 3,
    challenge: true,
    seed,
    par,
    timeLimit: 150,
  };
}

export function dailyCount() {
  return TOTAL_LEVELS;
}

/** Chapter list for the level map. */
export function allChapters() {
  const out = [];
  for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
    const first = (ch - 1) * LEVELS_PER_CHAPTER + 1;
    out.push({
      chapter: ch,
      ...chapterInfo(ch),
      first,
      last: first + LEVELS_PER_CHAPTER - 1,
      difficulty: tunings(first).diff,
    });
  }
  return out;
}

export function isLevelUnlocked(level, clearedUpTo) {
  return level <= clearedUpTo;
}

/** Stars needed: uses mistakes + time so it rewards clean + fast play. */
export function ratingFor(def, { mistakes, seconds }) {
  const clean = mistakes === 0;
  const fast = seconds <= def.par;
  const ok = seconds <= def.par * 1.75;
  if (clean && fast) return 3;
  if (clean || (mistakes <= 1 && ok)) return 2;
  return 1;
}

export function coinsFor(def, stars) {
  const base = def.kind === 'daily' ? 40 : 10;
  const mult = def.challenge ? 2.5 : 1;
  return Math.round((base + stars * 5) * mult);
}
