/* ============================================================
   board.js — DOM renderer for the arrow grid
   ============================================================ */

import { DIR_NAMES } from './levels.js';
import { REDUCED_MOTION } from './utils.js';

const ARROW_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4 22.2 13h-6.05v8.6H7.85V13H1.8z" fill="currentColor"/></svg>`;

export class BoardView {
  constructor({ boardEl, gridEl, arrowEl, cursorEl, onTap }) {
    this.boardEl = boardEl;
    this.gridEl = gridEl;
    this.arrowEl = arrowEl;
    this.cursorEl = cursorEl;
    this.onTap = onTap;
    this.arrows = [];
    this.def = null;
    this.rayEl = null;
    this.hinted = -1;

    this.boardEl.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.arrowEl.addEventListener('pointerdown', (ev) => {
      const node = ev.target.closest('.arrow');
      if (!node || node.classList.contains('is-escaping')) return;
      ev.preventDefault();
      const cell = Number(node.dataset.cell);
      const r = node.getBoundingClientRect();
      this.onTap(cell, r.left + r.width / 2, r.top + r.height / 2);
    });
  }

  build(def) {
    this.def = def;
    this.clearHint();
    this.arrows = new Array(def.size * def.size).fill(null);
    const { size } = def;
    this.gridEl.style.setProperty('--cols', size);
    this.gridEl.style.setProperty('--rows', size);
    this.arrowEl.style.setProperty('--cols', size);
    this.arrowEl.style.setProperty('--rows', size);
    this.arrowEl.classList.toggle('is-dense', size >= 7);

    // grid cells
    const frag = document.createDocumentFragment();
    for (let i = 0; i < def.size * def.size; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      frag.appendChild(cell);
    }
    this.gridEl.replaceChildren(frag);

    // arrows
    const afrag = document.createDocumentFragment();
    for (let cell = 0; cell < def.size * def.size; cell++) {
      const dir = def.dirs[cell];
      const node = document.createElement('div');
      node.className = 'arrow';
      node.dataset.cell = String(cell);
      node.dataset.dir = DIR_NAMES[dir];
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '-1');
      node.setAttribute('aria-label', `Arrow ${DIR_NAMES[dir]}, row ${((cell / size) | 0) + 1}, column ${(cell % size) + 1}`);
      node.style.setProperty('--x', cell % size);
      node.style.setProperty('--y', (cell / size) | 0);
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = ARROW_SVG;
      node.appendChild(tile);
      node.classList.add('is-entering');
      const wave = (cell % size) + ((cell / size) | 0);
      node.style.setProperty('--d', `${Math.min(wave * 24, 320)}ms`);
      this.arrows[cell] = node;
      afrag.appendChild(node);
    }
    this.arrowEl.replaceChildren(afrag);
    clearTimeout(this._enterT);
    this._enterT = setTimeout(() => {
      this.arrowEl.querySelectorAll('.is-entering').forEach((n) => n.classList.remove('is-entering'));
    }, REDUCED_MOTION ? 40 : 900);
    this.cursorEl.style.setProperty('--cols', size);
    this.cursorEl.style.setProperty('--rows', size);
  }

  /** Remove an arrow with a flight animation in its own direction. */
  escape(cell, dir) {
    const node = this.arrows[cell];
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const dist = Math.max(window.innerWidth, window.innerHeight) * 0.85;
    const vec = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    node.style.setProperty('--ex', `${vec[0] * dist}px`);
    node.style.setProperty('--ey', `${vec[1] * dist}px`);
    node.style.setProperty('--rot', `${dir === 1 ? 8 : dir === 3 ? -8 : dir === 0 ? 0 : 0}deg`);
    node.classList.add('is-escaping');
    this.arrows[cell] = null;
    if (this.hinted === cell) this.clearHint();
    const t = REDUCED_MOTION ? 30 : 460;
    setTimeout(() => node.remove(), t);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width };
  }

  /** Put an arrow back (undo). */
  restore(cell, dir) {
    const { size } = this.def;
    const node = document.createElement('div');
    node.className = 'arrow is-returning';
    node.dataset.cell = String(cell);
    node.dataset.dir = DIR_NAMES[dir];
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '-1');
    node.style.setProperty('--x', cell % size);
    node.style.setProperty('--y', (cell / size) | 0);
    node.style.setProperty('--cols', size);
    node.style.setProperty('--rows', size);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = ARROW_SVG;
    node.appendChild(tile);
    this.arrowEl.querySelectorAll(`.arrow[data-cell="${cell}"]`).forEach((n) => n.remove());
    this.arrowEl.appendChild(node);
    this.arrows[cell] = node;
    setTimeout(() => node.classList.remove('is-returning'), 420);
    return node;
  }

  blocked(cell) {
    const node = this.arrows[cell];
    if (!node) return;
    node.classList.remove('is-blocked');
    void node.offsetWidth;
    node.classList.add('is-blocked');
    clearTimeout(node._blockedT);
    node._blockedT = setTimeout(() => node.classList.remove('is-blocked'), 460);
  }

  /* ---------------- hint ---------------- */

  hint(cell, dir) {
    this.clearHint();
    const node = this.arrows[cell];
    if (!node) return;
    this.hinted = cell;
    node.classList.add('is-hinted');

    const layer = this.arrowEl.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const cx = r.left - layer.left + r.width / 2;
    const cy = r.top - layer.top + r.height / 2;
    const color = ['#22d3ee', '#a78bfa', '#fb7185', '#a3e635'][dir];
    const beam = document.createElement('div');
    beam.className = 'ray';
    beam.style.left = '0px';
    beam.style.top = '0px';
    const thick = Math.max(4, r.width * 0.14);

    if (dir === 0 || dir === 2) {
      beam.style.width = `${thick}px`;
      beam.style.height = `${dir === 0 ? cy : layer.height - cy}px`;
      beam.style.transform = `translate(${cx - thick / 2}px, ${dir === 0 ? 0 : cy}px)`;
      beam.style.background = `linear-gradient(${dir === 0 ? 'to top' : 'to bottom'}, transparent, ${color})`;
    } else {
      beam.style.height = `${thick}px`;
      beam.style.width = `${dir === 1 ? layer.width - cx : cx}px`;
      beam.style.transform = `translate(${dir === 1 ? cx : 0}px, ${cy - thick / 2}px)`;
      beam.style.background = `linear-gradient(${dir === 1 ? 'to right' : 'to left'}, transparent, ${color})`;
    }
    beam.style.color = color;
    this.arrowEl.appendChild(beam);
    this.rayEl = beam;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.clearHint(), 2600);
  }

  clearHint() {
    if (this.hinted >= 0 && this.arrows[this.hinted]) {
      this.arrows[this.hinted].classList.remove('is-hinted');
    }
    this.hinted = -1;
    if (this.rayEl) {
      this.rayEl.remove();
      this.rayEl = null;
    }
    clearTimeout(this._hintT);
  }

  /* ---------------- keyboard cursor ---------------- */

  setCursor(x, y, visible = true) {
    this.cursorEl.hidden = !visible;
    if (!visible) return;
    this.cursorEl.style.setProperty('--x', x);
    this.cursorEl.style.setProperty('--y', y);
  }

  cellCenter(cell) {
    const node = this.arrows[cell];
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }
}
