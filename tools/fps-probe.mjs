/* Measures real frame pacing while playing (needs CDP + static server). */
import puppeteer from 'puppeteer-core';

const b = await puppeteer.connect({ browserURL: process.env.CDP_URL || 'http://127.0.0.1:9333', defaultViewport: null });
const p = await b.newPage();
await p.setCacheEnabled(false);
await p.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 700));
await p.evaluate(() => {
  document.querySelector('.modal-close')?.click();
  window.__arrowEscape.app.startLevel(300);
});
await new Promise((r) => setTimeout(r, 600));

const result = await p.evaluate(async () => {
  const g = window.__arrowEscape.game;
  const frames = [];
  let last = performance.now();
  let stop = false;
  const loop = () => {
    const now = performance.now();
    frames.push(now - last);
    last = now;
    if (!stop) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const t0 = performance.now();
  let guard = 400;
  while (!g.engine.cleared && guard-- > 0) {
    const free = g.engine.freeCells();
    if (!free.length) break;
    const cell = free[0];
    const node = document.querySelector(`.arrow[data-cell="${cell}"]`);
    const r = node.getBoundingClientRect();
    g.onTap(cell, r.left + r.width / 2, r.top + r.height / 2);
    // also exercise the particle system
    await new Promise((res) => setTimeout(res, 12));
  }
  stop = true;
  const total = performance.now() - t0;
  const sorted = frames.slice(2).sort((a, b) => a - b);
  const pct = (q) => sorted[Math.floor(sorted.length * q)] || 0;
  return {
    frames: frames.length,
    durationMs: Math.round(total),
    avgFps: +(1000 / (sorted.reduce((a, b) => a + b, 0) / sorted.length)).toFixed(1),
    p50: +pct(0.5).toFixed(2),
    p95: +pct(0.95).toFixed(2),
    worst: +sorted[sorted.length - 1].toFixed(2),
    longFrames: sorted.filter((f) => f > 32).length,
    domNodes: document.getElementsByTagName('*').length,
    cleared: g.engine.cleared,
  };
});
console.log(result);
await b.disconnect();
