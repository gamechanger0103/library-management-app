/* ============================================================
   engine.js — pure puzzle rules (no DOM, easy to test)
   ============================================================ */

export const EMPTY = 255;

export class Engine {
  /**
   * @param {object} def level definition from levels.js
   */
  constructor(def) {
    this.def = def;
    this.size = def.size;
    this.n = def.size * def.size;
    this.reset();
  }

  reset() {
    const n = this.n;
    this.dirs = this.def.dirs;
    this.alive = new Uint8Array(n).fill(1);
    this.lanes = [];
    for (let i = 0; i < 12; i++) this.lanes.push(new Uint8Array(n));
    for (let cell = 0; cell < n; cell++) this._occupy(cell);

    this.remaining = n;
    this.moves = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.mistakes = 0;
    this.lives = this.def.lives;
    this.score = 0;
    this.history = [];
    this.escaped = [];
  }

  laneOf(dir, cell) {
    const size = this.size;
    const r = (cell / size) | 0;
    const c = cell % size;
    return (dir === 0 || dir === 2 ? c % 3 : r % 3);
  }

  _occupy(cell) {
    const size = this.size;
    const r = (cell / size) | 0;
    const c = cell % size;
    for (let d = 0; d < 4; d++) {
      const laneIdx = d * 3 + (d === 0 || d === 2 ? c % 3 : r % 3);
      this.lanes[laneIdx][cell] = 1;
    }
  }

  _vacate(cell) {
    const size = this.size;
    const r = (cell / size) | 0;
    const c = cell % size;
    for (let d = 0; d < 4; d++) {
      const laneIdx = d * 3 + (d === 0 || d === 2 ? c % 3 : r % 3);
      this.lanes[laneIdx][cell] = 0;
    }
  }

  /** Is the straight runway in `dir` free of arrows? */
  isFree(cell, dir) {
    const size = this.size;
    const r = (cell / size) | 0;
    const c = cell % size;
    const laneIdx = dir * 3 + (dir === 0 || dir === 2 ? c % 3 : r % 3);
    const lane = this.lanes[laneIdx];
    if (dir === 0) {
      for (let rr = r - 1; rr >= 0; rr--) if (lane[rr * size + c]) return false;
    } else if (dir === 2) {
      for (let rr = r + 1; rr < size; rr++) if (lane[rr * size + c]) return false;
    } else if (dir === 1) {
      for (let cc = c + 1; cc < size; cc++) if (lane[r * size + cc]) return false;
    } else {
      for (let cc = c - 1; cc >= 0; cc--) if (lane[r * size + cc]) return false;
    }
    return true;
  }

  freeDirs(cell) {
    if (!this.alive[cell]) return [];
    const d = this.dirs[cell];
    const out = [];
    if (this.isFree(cell, d)) out.push(d);
    // an arrow only ever leaves in its own direction, but checking every
    // lane is useful for "does this arrow have any hope" debugging.
    return out;
  }

  get dirOf() {
    return (cell) => this.dirs[cell];
  }

  canEscape(cell) {
    return this.alive[cell] === 1 && this.isFree(cell, this.dirs[cell]);
  }

  /** All cells that could escape right now. */
  freeCells() {
    const out = [];
    for (let cell = 0; cell < this.n; cell++) if (this.canEscape(cell)) out.push(cell);
    return out;
  }

  /**
   * Player taps an arrow.
   * @returns {{kind:'escape'|'blocked'|'invalid', cell:number, dir?:number, combo?:number, gained?:number, lives?:number}}
   */
  tap(cell) {
    if (cell < 0 || cell >= this.n || !this.alive[cell]) {
      return { kind: 'invalid', cell };
    }
    const dir = this.dirs[cell];
    if (!this.isFree(cell, dir)) {
      this.mistakes++;
      this.lives = Math.max(0, this.lives - 1);
      this.combo = 0;
      return { kind: 'blocked', cell, dir, lives: this.lives, mistakes: this.mistakes };
    }

    this.history.push({
      cell,
      dir,
      score: this.score,
      combo: this.combo,
      moves: this.moves,
      lives: this.lives,
      mistakes: this.mistakes,
    });
    if (this.history.length > 400) this.history.shift();

    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = 20 + Math.min(this.combo - 1, 9) * 8;
    this.score += gained;
    this.moves++;
    this.alive[cell] = 0;
    this._vacate(cell);
    this.remaining--;
    this.escaped.push(cell);

    return {
      kind: 'escape',
      cell,
      dir,
      combo: this.combo,
      gained,
      score: this.score,
      remaining: this.remaining,
    };
  }

  /** Undo the last successful escape. */
  undo() {
    const last = this.history.pop();
    if (!last) return null;
    const { cell, dir } = last;
    this.alive[cell] = 1;
    this.dirs[cell] = dir;
    this._occupy(cell);
    this.remaining++;
    this.score = last.score;
    this.combo = last.combo;
    this.moves = last.moves;
    this.lives = last.lives;
    this.mistakes = last.mistakes;
    this.escaped.pop();
    return { cell, dir };
  }

  /**
   * A guaranteed-good move. Prefers the level's authored solution so the
   * hint follows the intended path, otherwise any free arrow works.
   */
  hint() {
    const order = this.def.order;
    if (order) {
      for (let i = 0; i < order.length; i++) {
        const cell = order[i];
        if (this.alive[cell] && this.canEscape(cell)) {
          return { cell, dir: this.dirs[cell] };
        }
      }
    }
    for (let cell = 0; cell < this.n; cell++) {
      if (this.canEscape(cell)) return { cell, dir: this.dirs[cell] };
    }
    return null;
  }

  get cleared() {
    return this.remaining === 0;
  }

  get accuracy() {
    const taps = this.moves + this.mistakes;
    return taps ? Math.round((this.moves / taps) * 100) : 100;
  }

  get progress() {
    return 1 - this.remaining / this.n;
  }
}
