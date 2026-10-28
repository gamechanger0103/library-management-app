/* Node test harness for the pure game logic (no DOM needed).
   run: node tests/logic.test.mjs                                        */

import { getLevel, getDaily, tunings, TOTAL_LEVELS, ratingFor, coinsFor } from '../js/levels.js';
import { Engine } from '../js/engine.js';
import { mulberry32 } from '../js/utils.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name} ${extra}`);
  }
}

function freshEngine(def) {
  return new Engine(def);
}

/* 1 — every level must be solvable through its authored solution */
const t0 = performance.now();
for (let lv = 1; lv <= TOTAL_LEVELS; lv++) {
  const def = getLevel(lv);
  const e = freshEngine(def);
  check(`L${lv} order length`, def.order.length === def.size * def.size, `${def.order.length} vs ${def.size ** 2}`);
  let ok = true;
  for (const cell of def.order) {
    const res = e.tap(cell);
    if (res.kind !== 'escape') {
      ok = false;
      break;
    }
  }
  check(`L${lv} solvable`, ok && e.cleared, `remaining=${e.remaining}`);
  check(`L${lv} lives sane`, def.lives >= 2 && def.lives <= 8, String(def.lives));
  check(`L${lv} difficulty`, ['easy', 'medium', 'hard', 'expert'].includes(def.difficulty));
  check(`L${lv} challenge flag`, def.challenge === (lv % 10 === 0));
  check(`L${lv} no tiny boards`, def.size >= 4 && def.size <= 8);
}
const genMs = performance.now() - t0;

/* 2 — a fresh board always has at least 2 escapable arrows */
for (let lv = 1; lv <= TOTAL_LEVELS; lv += 7) {
  const def = getLevel(lv);
  const e = freshEngine(def);
  check(`L${lv} start has moves`, e.freeCells().length >= 2, `${e.freeCells().length}`);
}

/* 3 — random legal play always clears the board (no dead ends) */
let rng = mulberry32(12345);
let randomRuns = 0;
for (let lv = 1; lv <= TOTAL_LEVELS; lv += 13) {
  const def = getLevel(lv);
  const e = freshEngine(def);
  let guard = 5000;
  while (!e.cleared && guard-- > 0) {
    const free = e.freeCells();
    if (!free.length) break;
    e.tap(free[(rng() * free.length) | 0]);
  }
  randomRuns++;
  check(`L${lv} random play clears`, e.cleared, `remaining=${e.remaining}`);
  check(`L${lv} no dead end`, guard > 0);
}

/* 4 — hints always point at a legal arrow, all the way down */
for (let lv = 1; lv <= TOTAL_LEVELS; lv += 29) {
  const def = getLevel(lv);
  const e = freshEngine(def);
  let ok = true;
  while (!e.cleared) {
    const h = e.hint();
    if (!h || !e.canEscape(h.cell)) {
      ok = false;
      break;
    }
    if (e.tap(h.cell).kind !== 'escape') {
      ok = false;
      break;
    }
  }
  check(`L${lv} hint chain`, ok);
}

/* 5 — undo restores the exact previous state */
{
  const def = getLevel(42);
  const e = freshEngine(def);
  const before = { score: e.score, combo: e.combo, moves: e.moves, lives: e.lives, remaining: e.remaining };
  const free = e.freeCells();
  e.tap(free[0]);
  e.undo();
  check('undo score', e.score === before.score);
  check('undo combo', e.combo === before.combo);
  check('undo moves', e.moves === before.moves);
  check('undo lives', e.lives === before.lives);
  check('undo remaining', e.remaining === before.remaining);
  check('undo cell alive', e.alive[free[0]] === 1);
  check('undo lane restored', e.lanes.length === 12);
  check('undo empty stack', e.undo() === null);
}

/* 6 — blocked taps cost a life and reset the combo */
{
  const def = getLevel(300);
  const e = freshEngine(def);
  const free = new Set(e.freeCells());
  let blockedCell = -1;
  for (let c = 0; c < e.n; c++) {
    if (!free.has(c)) {
      blockedCell = c;
      break;
    }
  }
  check('has a blocked cell', blockedCell >= 0);
  const lives = e.lives;
  const res = e.tap(blockedCell);
  check('blocked result', res.kind === 'blocked');
  check('blocked costs life', e.lives === lives - 1);
  check('blocked no move', e.moves === 0);
  check('invalid tap safe', e.tap(-5).kind === 'invalid');
}

/* 7 — daily puzzles are valid for many future days */
{
  const start = new Date('2026-01-01T12:00:00Z');
  for (let i = 0; i < 90; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const def = getDaily(key);
    const e = freshEngine(def);
    let ok = true;
    for (const cell of def.order) {
      if (e.tap(cell).kind !== 'escape') {
        ok = false;
        break;
      }
    }
    check(`daily ${key}`, ok && e.cleared);
  }
}

/* 8 — rating + coins behave */
{
  const def = getLevel(5);
  def.par = 60;
  check('3 stars clean+fast', ratingFor(def, { mistakes: 0, seconds: 40 }) === 3);
  check('2 stars one mistake', ratingFor(def, { mistakes: 1, seconds: 40 }) === 2);
  check('2 stars slow clean', ratingFor(def, { mistakes: 0, seconds: 200 }) === 2);
  check('1 star messy', ratingFor(def, { mistakes: 3, seconds: 300 }) === 1);
  check('coins scale', coinsFor(def, 3) > coinsFor(def, 1));
  check('challenge pays more', coinsFor({ ...def, challenge: true }, 3) > coinsFor(def, 3));
}

/* 9 — tuning monotonic-ish, all four difficulties present */
{
  const diffs = new Set();
  for (let lv = 1; lv <= TOTAL_LEVELS; lv++) diffs.add(tunings(lv).diff);
  check('all difficulties used', diffs.size === 4, [...diffs].join(','));
  check('L1 is tiny', tunings(1).size === 4);
  check('L520 is chunky', tunings(520).size >= 7);
}

/* 10 — generation stays fast */
check('generation speed', genMs < 2500, `${genMs.toFixed(0)}ms`);

console.log(`\nlevels tested: ${TOTAL_LEVELS}, random runs: ${randomRuns}`);
console.log(`generated all levels in ${genMs.toFixed(0)}ms`);
console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log(failures.slice(0, 25).join('\n'));
  process.exit(1);
}
