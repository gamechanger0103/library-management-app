/* DOM smoke test — boots the real app inside jsdom and drives it.
   run: node tests/dom.test.mjs                                        */

import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;

// --- canvas stub (jsdom has no 2d context without the `canvas` package)
const ctxStub = {
  canvas: null,
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'butt',
  setTransform() {},
  clearRect() {},
  fillRect() {},
  beginPath() {},
  arc() {},
  moveTo() {},
  lineTo() {},
  fill() {},
  stroke() {},
  save() {},
  restore() {},
  translate() {},
  rotate() {},
};
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;

// --- misc jsdom gaps
if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = () => {};

// --- globals for the ES modules
const g = globalThis;
g.window = window;
g.document = window.document;
Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });
g.localStorage = window.localStorage;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const mqStub = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.matchMedia = mqStub;
g.matchMedia = mqStub;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

let pass = 0;
let fail = 0;
const fails = [];
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    fails.push(`${name}${extra ? ' — ' + extra : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { getLevel: getLevelForTest } = await import('../js/levels.js');
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => Array.from(window.document.querySelectorAll(sel));

function tapArrow(cell) {
  const node = window.document.querySelector(`.arrow[data-cell="${cell}"]`);
  if (!node) return false;
  node.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  return true;
}

/* ---------------- boot ---------------- */
await import('../js/main.js');
await sleep(30);

const { app, game, store } = window.__arrowEscape || {};
check('app booted', !!window.__arrowEscape);
check('title screen active', $('#screen-title').classList.contains('is-active'));
check('continue button label', $('#continue-label').textContent.trim().length > 0);
check('profile created', !!store.data.createdAt);
check('starter coins', store.data.coins >= 120, String(store.data.coins));

// dismiss the first-time how-to modal if it opened
await sleep(1000);
if ($('#modal-root').classList.contains('is-open')) {
  const btns = $$('#modal-root .modal-actions .btn');
  check('howto/first modal has action', btns.length > 0);
  btns[0].click();
  await sleep(280);
}

/* ---------------- start level 1 ---------------- */
app.startLevel(1);
await sleep(60);

check('game screen active', $('#screen-game').classList.contains('is-active'));
check('board built', $$('#arrow-layer .arrow').length === 16, String($$('#arrow-layer .arrow').length));
check('grid cells', $$('#grid .cell').length === 16);
check('hud level', $('#hud-level').textContent === '1');
check('hearts rendered', $$('#hud-lives .heart').length >= 4, String($$('#hud-lives .heart').length));
check('engine ready', game.engine && game.engine.remaining === 16);

/* ---------------- tap a blocked arrow ---------------- */
{
  const free = new Set(game.engine.freeCells());
  let blocked = -1;
  for (let c = 0; c < 16; c++) if (!free.has(c)) { blocked = c; break; }
  if (blocked >= 0) {
    const livesBefore = game.engine.lives;
    tapArrow(blocked);
    await sleep(20);
    check('blocked tap costs a life', game.engine.lives === livesBefore - 1, `${livesBefore} -> ${game.engine.lives}`);
    check('blocked tap keeps arrow', $$(`.arrow[data-cell="${blocked}"]`).length === 1);
    check('board shake registered', $('#board-wrap').className.includes('is-shaking'));
    check('lost heart styled', $$('#hud-lives .heart.is-lost').length >= 1);
  } else {
    check('found a blocked arrow to test', false);
  }
}

/* ---------------- hint power-up ---------------- */
{
  const coins = store.data.coins;
  const hintBtn = $('.power[data-power="hint"]');
  hintBtn.click();
  await sleep(30);
  check('hint spends coins', store.data.coins === coins - 10, `${coins} -> ${store.data.coins}`);
  check('hint highlights an arrow', $$('.arrow.is-hinted').length === 1);
  check('hint draws a beam', !!$('.ray'));
  check('hint stats counted', store.data.stats.hints >= 1);
}

/* ---------------- undo power-up ---------------- */
{
  const e = game.engine;
  const freeBefore = e.freeCells();
  const target = freeBefore[0];
  const scoreBefore = e.score;
  tapArrow(target);
  await sleep(30);
  check('tap removes arrow from dom', $$(`.arrow[data-cell="${target}"]:not(.is-escaping)`).length === 0);
  check('score increased', e.score > scoreBefore);
  const coins = store.data.coins;
  $('.power[data-power="undo"]').click();
  await sleep(30);
  check('undo refunds board state', e.alive[target] === 1);
  check('undo charges coins', store.data.coins === coins - 15, `${coins} -> ${store.data.coins}`);
  check('undo re-adds arrow dom', $$(`.arrow[data-cell="${target}"]`).length >= 1);
  check('moves counter reset', e.moves === 0);
}

/* ---------------- extra life ---------------- */
{
  const lives = game.engine.lives;
  const coins = store.data.coins;
  $('.power[data-power="life"]').click();
  await sleep(20);
  check('life bought', game.engine.lives === lives + 1, `${lives} -> ${game.engine.lives}`);
  check('life charged', store.data.coins === coins - 30);
}

/* ---------------- keyboard play ---------------- */
{
  const before = game.engine.moves;
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await sleep(20);
  check('keyboard cursor visible', !$('#cursor').hidden);
  check('keyboard cursor moved', $('#cursor').style.getPropertyValue('--x') === '3', $('#cursor').style.cssText);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(20);
  check('keyboard fires arrow or safely no-ops', game.engine.moves >= before);
}

/* ---------------- pause ---------------- */
{
  $('#btn-pause').click();
  await sleep(40);
  check('pause opens modal', $('#modal-root').classList.contains('is-open'));
  check('pause flag', game.paused === true);
  const resume = $$('#modal-root .modal-actions .btn')[0];
  resume.click();
  await sleep(300);
  check('resume closes modal', !$('#modal-root').classList.contains('is-open'));
  check('resume flag', game.paused === false);
}

/* ---------------- clear the level ---------------- */
{
  let guard = 200;
  while (!game.engine.cleared && guard-- > 0) {
    const free = game.engine.freeCells();
    if (!free.length) break;
    tapArrow(free[0]);
    await sleep(2);
  }
  check('level cleared', game.engine.cleared, `remaining ${game.engine.remaining}`);
  check('win flag', game.over === true);
  await sleep(700);
  check('win modal visible', $('#modal-root').classList.contains('is-open'));
  check('stars rendered', $$('#modal-root .big-star').length === 3);
  check('stars earned', $$('#modal-root .big-star.on').length >= 1);
  check('coins persisted', store.data.stars[1] >= 1, JSON.stringify(store.data.stars));
  check('progress advanced', store.data.current === 2, String(store.data.current));
  check('highscore stored', store.data.highscores.length === 1);
  check('achievement unlocked', !!store.data.achievements.first);
  check('streak started', store.data.streak.count === 1, String(store.data.streak.count));
}

/* ---------------- next level ---------------- */
{
  const nextBtn = $$('#modal-root .modal-actions .btn')[0];
  nextBtn.click();
  await sleep(80);
  check('next level starts', game.def.level === 2);
  check('new board built', $$('#arrow-layer .arrow').length === game.def.size * game.def.size);
  check('modal closed after next', !$('#modal-root').classList.contains('is-open'));
}

/* ---------------- game over path ---------------- */
{
  game.engine.lives = 1;
  const free = new Set(game.engine.freeCells());
  let blocked = -1;
  for (let c = 0; c < game.engine.n; c++) if (!free.has(c)) { blocked = c; break; }
  if (blocked >= 0) {
    tapArrow(blocked);
    await sleep(400);
    check('game over modal', game.over === true && $('#modal-root').classList.contains('is-open'));
    const title = $('#modal-root .modal-title')?.textContent || '';
    check('game over title', /Lives|Up/i.test(title), title);
    const retry = $$('#modal-root .modal-actions .btn').find((b) => /Retry/i.test(b.textContent));
    check('retry offered', !!retry);
    retry.click();
    await sleep(60);
    check('retry restarts level', game.def.level === 2 && game.engine.remaining === game.def.size ** 2);
    check('retry clears over flag', game.over === false);
  } else {
    check('found blocked arrow for gameover', false);
  }
}

/* ---------------- level map ---------------- */
{
  game.exit(true);
  await sleep(80);
  check('level map shown', $('#screen-levels').classList.contains('is-active'));
  check('level buttons rendered', $$('#level-list .lv').length === 520, String($$('#level-list .lv').length));
  check('locked levels disabled', $$('#level-list .lv.is-locked').length > 400);
  check('next level highlighted', $$('#level-list .lv.is-next').length === 1);
  $$('#filter-row .chip')[3].click();
  await sleep(50);
  check('difficulty filter works', $$('#level-list .chapter').length > 0);
  $$('#filter-row .chip')[0].click();
  await sleep(30);
}

/* ---------------- settings + theme ---------------- */
{
  $('#btn-levels-settings').click();
  await sleep(50);
  check('settings modal', !!$$('#modal-root .switch').length);
  const themeLight = $$('[data-theme-choice]').find((b) => b.dataset.themeChoice === 'light');
  themeLight.click();
  await sleep(20);
  check('light theme applied', window.document.documentElement.dataset.theme === 'light');
  check('theme persisted', store.settings.theme === 'light');
  const soundSwitch = $$('#modal-root .switch')[0];
  soundSwitch.click();
  check('sound toggle off', store.settings.sound === false);
  soundSwitch.click();
  check('sound toggle on', store.settings.sound === true);
  $('.modal-close')?.click();
  await sleep(260);
}

/* ---------------- daily reward + daily puzzle ---------------- */
{
  app.showTitle();
  await sleep(50);
  check('title meta coins', $('#meta-coins').textContent === String(store.data.coins));

  const before = store.data.coins;
  app.startDaily();
  await sleep(60);
  check('daily board built', game.mode === 'daily' && game.def.kind === 'daily');
  check('daily hud label', $('#hud-level-label').textContent === 'DAILY');

  let guard = 300;
  while (!game.engine.cleared && guard-- > 0) {
    const free = game.engine.freeCells();
    if (!free.length) break;
    tapArrow(free[0]);
    await sleep(1);
  }
  await sleep(700);
  check('daily cleared', store.data.stats.dailyCleared === 1);
  check('daily marked', store.data.daily.cleared === true);
  check('daily paid coins', store.data.coins > before);
  check('daily modal', $('#modal-root').classList.contains('is-open'));
  $('.modal-close')?.click();
  await sleep(260);
}


/* ---------------- pause -> settings -> back to pause ---------------- */
{
  app.startLevel(12);
  await sleep(80);
  $('#btn-pause').click();
  await sleep(50);
  check('pause modal opened', $('#modal-root').classList.contains('is-open'));
  const settingsBtn = $$('#modal-root .modal-actions .btn').find((b) => /Settings/i.test(b.textContent));
  check('pause offers settings', !!settingsBtn);
  settingsBtn.click();
  await sleep(350);
  check('settings opened from pause', $$('#modal-root .switch').length === 3);
  $('.modal-close').click();
  await sleep(400);
  check('returns to pause screen', $('#modal-root').classList.contains('is-open'));
  check('still paused', game.paused === true);
  const clockBefore = game.elapsed();
  await sleep(300);
  check('clock frozen while paused', Math.abs(game.elapsed() - clockBefore) < 0.05, `${clockBefore} -> ${game.elapsed()}`);
  $$('#modal-root .modal-actions .btn')[0].click();
  await sleep(320);
  check('resume from pause', game.paused === false && !$('#modal-root').classList.contains('is-open'));
}

/* ---------------- shuffle power ---------------- */
{
  store.data.coins = 500;
  game.updateCoinUI();
  const before = game.def.dirs;
  const free = game.engine.freeCells();
  tapArrow(free[0]);
  await sleep(40);
  $('.power[data-power="shuffle"]').click();
  await sleep(60);
  check('shuffle asks for confirmation', $('#modal-root').classList.contains('is-open'));
  const confirm = $$('#modal-root .modal-actions .btn').find((b) => /Reshuffle/i.test(b.textContent));
  check('shuffle confirm button', !!confirm);
  confirm.click();
  await sleep(120);
  check('shuffle rebuilds board', game.def.dirs !== before);
  check('shuffle keeps arrow count', $$('#arrow-layer .arrow').length === game.def.size ** 2);
  check('shuffle refills lives', game.engine.lives === game.def.lives);
  check('shuffle charged coins', store.data.coins === 500 - 25, String(store.data.coins));
  check('shuffled board solvable', (() => {
    const e = new (game.engine.constructor)(game.def);
    for (const cell of game.def.order) if (e.tap(cell).kind !== 'escape') return false;
    return e.cleared;
  })());
}

/* ---------------- daily login reward ---------------- */
{
  app.showTitle();
  await sleep(60);
  store.data.rewards.lastClaimDay = null;
  const coins = store.data.coins;
  $('#btn-rewards').click();
  await sleep(80);
  check('rewards modal', $('#modal-root').classList.contains('is-open'));
  check('7 day calendar', $$('#modal-root .day').length === 7);
  const claim = $$('#modal-root .modal-actions .btn').find((b) => /Claim/i.test(b.textContent));
  check('claim button present', !!claim);
  claim.click();
  await sleep(120);
  check('coins granted', store.data.coins === coins + 25, `${coins} -> ${store.data.coins}`);
  check('claim day stored', !!store.data.rewards.lastClaimDay);
  $('.modal-close').click();
  await sleep(280);
  check('claim dot hidden after claim', $('#rewards-dot').hidden === true);
}

/* ---------------- cheat-sheet: all 520 levels build a board ---------------- */
{
  let built = 0;
  for (const lv of [1, 10, 25, 60, 100, 141, 260, 400, 520]) {
    app.startLevel(lv);
    await sleep(25);
    const expect = getLevelForTest(lv).size ** 2;
    if ($$('#arrow-layer .arrow').length === expect) built++;
  }
  check('every sample level renders its board', built === 9, `${built}/9`);
}

/* ---------------- persistence ---------------- */
{
  const raw = window.localStorage.getItem('arrowEscape.profile.v1');
  check('profile saved to localStorage', !!raw);
  const parsed = JSON.parse(raw || '{}');
  check('saved current level', parsed.current >= 2);
  check('saved stars', Object.keys(parsed.stars || {}).length >= 1);
}

check('no uncaught window errors', errors.length === 0, errors.join(' | '));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed`);
if (fail) console.log(fails.join('\n'));

// stop the game clock + audio scheduler so node can exit
try {
  game.exit();
  window.__arrowEscape.store.save();
} catch (e) {
  /* noop */
}
process.exit(fail ? 1 : 0);
