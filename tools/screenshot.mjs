/* Visual QA harness.
   Requires a Chromium with a CDP endpoint (see tools/README-visual.md) and the
   static server running. Writes PNGs into .screenshots/.                       */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = new URL('../.screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browserURL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const browser = await puppeteer.connect({ browserURL, defaultViewport: null });

const errors = [];
const page = await browser.newPage();
await page.setCacheEnabled(false);
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: OUT + name + '.png' });
  console.log('•', name);
};

await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await wait(1500);

// first-run how-to
await shot('01-howto');
await page.evaluate(() => document.querySelector('.modal-close')?.click());
await wait(400);
await shot('02-title');

// game
await page.evaluate(() => window.__arrowEscape.app.startLevel(1));
await wait(600);
await shot('03-game');

// tap two real arrows to prove hit-testing works
const cells = await page.evaluate(() => window.__arrowEscape.game.engine.freeCells().slice(0, 2));
for (const c of cells) {
  await page.click(`.arrow[data-cell="${c}"]`).catch((e) => errors.push('CLICK FAIL ' + c + ' ' + e.message));
  await wait(220);
}
await shot('04-game-after-taps');

// hint beam
await page.evaluate(() => document.querySelector('.power[data-power="hint"]').click());
await wait(350);
await shot('05-hint');

// finish the level -> celebration + win modal
await page.evaluate(async () => {
  const g = window.__arrowEscape.game;
  let guard = 200;
  while (!g.engine.cleared && guard-- > 0) {
    const free = g.engine.freeCells();
    if (!free.length) break;
    const cell = free[0];
    const node = document.querySelector(`.arrow[data-cell="${cell}"]`);
    const r = node.getBoundingClientRect();
    g.onTap(cell, r.left + r.width / 2, r.top + r.height / 2);
    await new Promise((res) => setTimeout(res, 6));
  }
});
await wait(700);
await shot('06-celebration');
await wait(700);
await shot('07-win-modal');
await page.evaluate(() => document.querySelector('.modal-close')?.click());
await wait(400);

// level map
await page.evaluate(() => window.__arrowEscape.app.showLevels());
await wait(600);
await shot('08-level-map');

// settings
await page.evaluate(() => window.__arrowEscape.app.openSettings());
await wait(500);
await shot('09-settings');
await page.evaluate(() => document.querySelector('.modal-close')?.click());
await wait(400);

// light theme title
await page.evaluate(() => {
  window.__arrowEscape.store.data.settings.theme = 'light';
  document.documentElement.dataset.theme = 'light';
  window.__arrowEscape.app.showTitle();
});
await wait(500);
await shot('10-title-light');

// light theme game
await page.evaluate(() => window.__arrowEscape.app.startLevel(37));
await wait(600);
await shot('11-game-light');

// dark, big board (challenge level)
await page.evaluate(() => {
  window.__arrowEscape.store.data.settings.theme = 'dark';
  document.documentElement.dataset.theme = 'dark';
  window.__arrowEscape.app.startLevel(100);
});
await wait(700);
await shot('12-challenge-board');

// blocked state
await page.evaluate(() => {
  const g = window.__arrowEscape.game;
  const free = new Set(g.engine.freeCells());
  for (let c = 0; c < g.engine.n; c++) {
    if (!free.has(c)) {
      const r = document.querySelector(`.arrow[data-cell="${c}"]`).getBoundingClientRect();
      g.onTap(c, r.left + r.width / 2, r.top + r.height / 2);
      break;
    }
  }
});
await wait(120);
await shot('13-blocked');

// landscape
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => window.__arrowEscape.app.startLevel(21));
await wait(600);
await shot('14-landscape');

// desktop
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
await page.evaluate(() => window.__arrowEscape.app.startLevel(140));
await wait(700);
await shot('15-desktop-game');
await page.evaluate(() => window.__arrowEscape.app.showTitle());
await wait(500);
await shot('16-desktop-title');

// small phone
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => window.__arrowEscape.app.startLevel(300));
await wait(600);
await shot('17-small-phone');

console.log('\nconsole/page errors:', errors.length ? errors : 'none');

// useful layout metrics from the real engine
const metrics = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(1), y: +r.top.toFixed(1) };
  };
  const board = document.querySelector('#board');
  const arrow = document.querySelector('.arrow');
  const tile = document.querySelector('.tile');
  return {
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    screen: box('#screen-game'),
    hud: box('.hud'),
    board: box('#board'),
    powerbar: box('.powerbar'),
    arrow: box('.arrow'),
    tile: box('.tile'),
    scrollH: document.documentElement.scrollHeight,
    bodyOverflow: document.body.scrollHeight - innerHeight,
    arrowCount: document.querySelectorAll('.arrow').length,
  };
});
console.log(metrics);

await browser.disconnect();
