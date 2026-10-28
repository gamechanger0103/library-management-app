/* ============================================================
   fx.js — particle canvas, confetti, shockwaves, screen shake
   ============================================================ */

import { REDUCED_MOTION, clamp } from './utils.js';

const MAX_PARTICLES = typeof window !== 'undefined' && window.innerWidth < 520 ? 420 : 720;
const PALETTE = ['#22d3ee', '#a78bfa', '#fb7185', '#a3e635', '#fbbf24', '#f0abfc', '#67e8f9'];

let canvas = null;
let ctx = null;
let dpr = 1;
let w = 0;
let h = 0;
let particles = [];
let running = false;
let rafId = 0;
let lastTs = 0;

export function initFx(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { alpha: true });
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });
}

function resize() {
  if (!canvas || !ctx) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ensureLoop() {
  if (running) return;
  running = true;
  lastTs = performance.now();
  rafId = requestAnimationFrame(step);
}

function step(ts) {
  const dt = Math.min(50, ts - lastTs) / 1000;
  lastTs = ts;
  ctx.clearRect(0, 0, w, h);

  // pass 1 — additive glow bits
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.add) continue;
    drawOne(p);
  }
  // pass 2 — normal (confetti / rings)
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.add) continue;
    drawOne(p);
  }
  ctx.globalAlpha = 1;

  // integrate
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += (p.gravity || 0) * dt;
    p.vx *= 1 - (p.drag || 0) * dt;
    p.vy *= 1 - (p.drag || 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.grow) p.size += p.grow * dt;
  }

  if (particles.length === 0) {
    running = false;
    ctx.clearRect(0, 0, w, h);
    return;
  }
  rafId = requestAnimationFrame(step);
}

function drawOne(p) {
  const t = clamp(p.life / p.maxLife, 0, 1);
  let alpha = p.fadeHard ? t : Math.min(1, t * 1.6);
  if (p.shape === 'ring') alpha = 1 - t;
  ctx.globalAlpha = Math.max(0, alpha) * (p.alpha ?? 1);

  if (p.shape === 'rect') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    const sq = p.size;
    ctx.fillRect(-sq / 2, -sq / 4, sq, sq / 2);
    ctx.restore();
    return;
  }
  if (p.shape === 'ring') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1, p.width * t);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (p.shape === 'streak') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
    ctx.stroke();
    return;
  }
  // dot with soft glow
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
  ctx.fill();
}

function add(p) {
  if (REDUCED_MOTION) return;
  if (particles.length >= MAX_PARTICLES) particles.shift();
  p.maxLife = p.life;
  particles.push(p);
  ensureLoop();
}

/* ---------------- public effects ---------------- */

export function burst(x, y, opts = {}) {
  const {
    count = 16,
    colors = PALETTE,
    speed = 260,
    spread = Math.PI * 2,
    angle = 0,
    size = 5,
    gravity = 620,
    life = 0.62,
    shape = 'dot',
    add: additive = true,
    drag = 1.6,
  } = opts;
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const sp = speed * (0.35 + Math.random() * 0.9);
    add({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: life * (0.6 + Math.random() * 0.7),
      size: size * (0.5 + Math.random()),
      color: colors[(Math.random() * colors.length) | 0],
      shape,
      gravity,
      drag,
      add: additive,
      rot: 0,
      vr: 0,
    });
  }
}

export function ring(x, y, color = '#22d3ee', opts = {}) {
  const { size = 18, grow = 240, life = 0.42, width = 3 } = opts;
  add({
    x,
    y,
    vx: 0,
    vy: 0,
    life,
    size,
    width,
    color,
    shape: 'ring',
    grow,
    gravity: 0,
    drag: 0,
    add: false,
    rot: 0,
    vr: 0,
  });
}

export function confetti(x, y, opts = {}) {
  const { count = 46, speed = 420, life = 1.5 } = opts;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
    const sp = speed * (0.4 + Math.random() * 0.85);
    add({
      x: x + (Math.random() - 0.5) * 40,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: life * (0.6 + Math.random() * 0.7),
      size: 5 + Math.random() * 6,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      shape: 'rect',
      gravity: 620,
      drag: 1.1,
      add: false,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
    });
  }
}

export function coinPop(x, y) {
  burst(x, y, { count: 12, colors: ['#fbbf24', '#fde68a', '#f59e0b'], speed: 190, size: 4, life: 0.7 });
  ring(x, y, '#fbbf24', { size: 8, grow: 190, life: 0.4, width: 2 });
}

export function trail(x, y, color) {
  add({
    x,
    y,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    life: 0.34,
    size: 3.4,
    color,
    shape: 'dot',
    gravity: 60,
    drag: 2,
    add: true,
    rot: 0,
    vr: 0,
  });
}

export function shake(node, big = false) {
  if (!node) return;
  const cls = big ? 'is-shaking-lg' : 'is-shaking';
  node.classList.remove('is-shaking', 'is-shaking-lg');
  // force reflow so the animation can restart
  void node.offsetWidth;
  node.classList.add(cls);
  const dur = big ? 520 : 400;
  setTimeout(() => node.classList.remove(cls), dur);
}

export function clearFx() {
  particles.length = 0;
  if (ctx) ctx.clearRect(0, 0, w, h);
}
