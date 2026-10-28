/* ============================================================
   game.js — level runtime: input, juice, powers, results
   ============================================================ */

import { Engine } from './engine.js';
import { BoardView } from './board.js';
import { generateBoard, ratingFor, coinsFor, DIFFICULTY_META } from './levels.js';
import { store } from './storage.js';
import { audio } from './audio.js';
import { haptic } from './haptics.js';
import * as fx from './fx.js';
import { toast, openModal, closeModal, isModalOpen } from './ui.js';
import { evaluateAchievements, touchStreak } from './achievements.js';
import { fmtTime, clamp, mulberry32, dayKey, REDUCED_MOTION } from './utils.js';
import { icon } from './icons.js';

export const COSTS = { hint: 10, undo: 15, shuffle: 25, life: 30 };

const DIR_COLOR = ['#22d3ee', '#a78bfa', '#fb7185', '#a3e635'];
const DIR_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

export class Game {
  constructor(app) {
    this.app = app;

    const q = (id) => document.getElementById(id);
    this.dom = {
      screen: q('screen-game'),
      board: q('board'),
      boardWrap: q('board-wrap'),
      grid: q('grid'),
      arrowLayer: q('arrow-layer'),
      cursor: q('cursor'),
      combo: q('combo-layer'),
      levelNum: q('hud-level'),
      levelLabel: q('hud-level-label'),
      levelBox: q('hud-level'),
      score: q('hud-score'),
      moves: q('hud-moves'),
      time: q('hud-time'),
      lives: q('hud-lives'),
      caption: q('board-caption'),
      progress: q('board-progress'),
      coinCount: q('coin-count'),
      coinBox: q('coin-balance'),
      pauseBtn: q('btn-pause'),
    };

    this.view = new BoardView({
      boardEl: this.dom.board,
      gridEl: this.dom.grid,
      arrowEl: this.dom.arrowLayer,
      cursorEl: this.dom.cursor,
      onTap: (cell, x, y) => this.onTap(cell, x, y),
    });

    this.engine = null;
    this.def = null;
    this.mode = 'level';
    this.paused = false;
    this.over = false;
    this.running = false;
    this.tStart = 0;
    this.tAccum = 0;
    this.timerHandle = 0;
    this.run = { hints: 0, undos: 0, shuffles: 0, lives: 0 };
    this.maxLives = 3;
    this.reason = '';
    this.cursor = { x: 0, y: 0, active: false };

    this.dom.pauseBtn.addEventListener('click', () => this.togglePause());

    document.querySelectorAll('.power').forEach((btn) => {
      btn.addEventListener('click', () => this.usePower(btn.dataset.power, btn));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isActive() && !this.paused && !this.over) this.togglePause();
    });
  }

  isActive() {
    return this.dom.screen.classList.contains('is-active') && !!this.engine;
  }

  /* ---------------- lifecycle ---------------- */

  start(def, mode = 'level') {
    this.def = def;
    this.baseDef = def;
    this.mode = mode;
    this.paused = false;
    this.over = false;
    this.reason = '';
    this.engine = new Engine(def);
    this.run = { hints: 0, undos: 0, shuffles: 0, lives: 0 };
    this.maxLives = def.lives;
    this.tAccum = 0;
    this.tStart = performance.now();
    this.running = true;
    this.cursor = { x: (def.size / 2) | 0, y: (def.size / 2) | 0, active: false };

    this.view.build(def);
    this.view.setCursor(this.cursor.x, this.cursor.y, false);
    this.renderHud();
    this.setCaption(`${def.arrows} arrows · tap one with a clear lane`);
    this.dom.score.textContent = '0';

    store.data.stats.plays++;
    store.touch();

    this.startClock();
    if (def.challenge && this.mode === 'level') {
      setTimeout(() => toast('Challenge level — 2.5× coins!', { icon: 'crown', ms: 2400 }), 420);
    }
  }

  /** Same level, fresh board (drops any shuffle / revive tweaks). */
  restart() {
    if (!this.baseDef) return;
    this.start(this.baseDef, this.mode);
  }

  /** New board layout, keep score + clock (shuffle power). */
  applyNewBoard(def) {
    this.def = def;
    this.engine = new Engine(def);
    this.maxLives = Math.max(this.maxLives, def.lives);
    this.view.build(def);
    this.renderHud();
    this.setCaption('Board reshuffled · new runways');
  }

  startClock() {
    this.stopClock();
    this.timerHandle = setInterval(() => this.onTick(), 200);
    this.onTick();
  }

  stopClock() {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerHandle = 0;
    this.running = false;
  }

  pauseClock() {
    if (!this.running) return;
    this.tAccum += (performance.now() - this.tStart) / 1000;
    this.running = false;
  }

  resumeClock() {
    if (this.running) return;
    this.tStart = performance.now();
    this.running = true;
  }

  elapsed() {
    return this.tAccum + (this.running ? (performance.now() - this.tStart) / 1000 : 0);
  }

  onTick() {
    if (!this.engine || this.over) return;
    const el = this.elapsed();
    const limit = this.def.timeLimit;
    if (limit) {
      const left = Math.max(0, limit - el);
      this.dom.time.textContent = fmtTime(left);
      this.dom.time.classList.toggle('is-low', left <= 15);
      if (left <= 0) {
        this.lose('time');
        return;
      }
    } else {
      this.dom.time.textContent = fmtTime(el);
      this.dom.time.classList.remove('is-low');
    }
  }

  /* ---------------- interaction ---------------- */

  onTap(cell, x, y) {
    if (!this.engine || this.over || this.paused) return;
    if (!this.engine.alive[cell]) return;
    audio.ensure();
    this.view.clearHint();

    const res = this.engine.tap(cell);

    if (res.kind === 'blocked') {
      this.onBlocked(cell);
      return;
    }
    if (res.kind !== 'escape') return;

    const center = this.view.escape(cell, res.dir) || { x, y };
    this.onEscaped(res, center);
  }

  onEscaped(res, center) {
    const { dir, combo, gained } = res;
    const color = DIR_COLOR[dir];

    audio.play('fly', { level: combo });
    if (combo >= 2) setTimeout(() => audio.play('combo', { level: combo }), 55);
    if (combo === 1 || combo % 4 === 0) haptic('escape');

    fx.burst(center.x, center.y, {
      count: 11,
      colors: [color, '#ffffff', color],
      angle: DIR_ANGLE[dir],
      spread: 1.25,
      speed: 330,
      size: 4.4,
      life: 0.55,
      gravity: 340,
    });
    fx.ring(center.x, center.y, color, { size: 8, grow: 190, life: 0.4, width: 3 });
    if (combo >= 5) fx.shake(this.dom.boardWrap, false);

    this.bumpScore();
    this.updateProgress();
    this.dom.moves.textContent = this.engine.moves;
    this.updateCaption();

    if (combo >= 3 && combo % 3 === 0) {
      this.showCombo(`×${combo} COMBO`, combo >= 9);
    }
    if (combo >= 2) {
      const pop = document.createElement('div');
      pop.className = 'combo-pop';
      pop.style.top = '70%';
      pop.style.fontSize = '.9rem';
      pop.style.opacity = '.95';
      pop.textContent = `+${gained}`;
      pop.style.animationDuration = '.62s';
      this.dom.combo.appendChild(pop);
      setTimeout(() => pop.remove(), 640);
    }

    if (this.engine.cleared) this.win();
  }

  onBlocked(cell) {
    this.engine && this.view.blocked(cell);
    audio.play('blocked');
    haptic('blocked');
    fx.shake(this.dom.boardWrap, true);
    const c = this.view.cellCenter(cell);
    if (c) {
      fx.burst(c.x, c.y, {
        count: 9,
        colors: ['#ff5470', '#ffffff'],
        speed: 190,
        size: 3.6,
        life: 0.4,
        gravity: 500,
      });
      fx.ring(c.x, c.y, '#ff5470', { size: 10, grow: 130, life: 0.3, width: 2 });
    }
    this.renderHearts(true);
    this.dom.moves.textContent = this.engine.moves;
    this.updateCaption();
    if (this.engine.lives <= 0) {
      setTimeout(() => this.lose('lives'), 240);
    }
  }

  showCombo(text, hot) {
    const node = document.createElement('div');
    node.className = 'combo-pop' + (hot ? ' is-hot' : '');
    node.textContent = text;
    this.dom.combo.appendChild(node);
    setTimeout(() => node.remove(), 820);
  }

  bumpScore() {
    this.dom.score.textContent = this.engine.score.toLocaleString();
    this.dom.score.classList.remove('is-bump');
    void this.dom.score.offsetWidth;
    this.dom.score.classList.add('is-bump');
  }

  updateProgress() {
    const pct = (1 - this.engine.remaining / this.engine.n) * 100;
    if (this.dom.progress) this.dom.progress.style.width = `${pct}%`;
  }

  setCaption(text) {
    this.dom.caption.textContent = text;
  }

  /** Live "x left · y lanes open" readout under the board. */
  updateCaption() {
    if (!this.engine) return;
    const free = this.engine.freeCells().length;
    const left = this.engine.remaining;
    this.dom.caption.textContent = `${left} left · ${free} lane${free === 1 ? '' : 's'} open`;
  }

  /* ---------------- hud ---------------- */

  renderHud() {
    const d = this.def;
    this.dom.levelNum.textContent = d.kind === 'daily' ? '★' : String(d.level);
    this.dom.levelLabel.textContent = d.kind === 'daily' ? 'DAILY' : d.challenge ? 'CHALLENGE' : DIFFICULTY_META[d.difficulty].label.toUpperCase();
    this.dom.levelBox.classList.toggle('is-challenge', !!d.challenge);
    this.dom.score.textContent = this.engine.score.toLocaleString();
    this.dom.moves.textContent = this.engine.moves;
    this.renderHearts(false);
    this.updateProgress();
    this.updateCoinUI();
    this.updateCaption();
    this.onTick();
  }

  renderHearts(pop = false) {
    const total = Math.max(this.maxLives, this.engine.lives, 1);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const h = document.createElement('span');
      h.className = 'heart' + (i < this.engine.lives ? '' : ' is-lost');
      h.textContent = '♥';
      if (pop && i === this.engine.lives) {
        h.classList.add('is-pop');
      }
      frag.appendChild(h);
    }
    this.dom.lives.replaceChildren(frag);
  }

  updateCoinUI() {
    const coins = store.data.coins;
    this.dom.coinCount.textContent = coins;
    document.querySelectorAll('.power').forEach((btn) => {
      const cost = COSTS[btn.dataset.power];
      if (cost == null) return;
      btn.classList.toggle('is-disabled', coins < cost);
    });
    const undoBtn = document.querySelector('.power[data-power="undo"]');
    if (undoBtn) undoBtn.classList.toggle('is-disabled', !this.engine || !this.engine.history.length);
    const coinEls = document.querySelectorAll('#meta-coins');
    coinEls.forEach((e) => (e.textContent = coins));
  }

  /* ---------------- power-ups ---------------- */

  spend(cost) {
    const p = store.data;
    if (p.coins < cost) {
      audio.play('blocked');
      toast(`Need ${cost - p.coins} more coins — clear levels to earn them`, { icon: 'coin' });
      this.dom.coinBox.classList.remove('is-bump');
      void this.dom.coinBox.offsetWidth;
      this.dom.coinBox.classList.add('is-bump');
      return false;
    }
    p.coins -= cost;
    store.touch();
    this.updateCoinUI();
    return true;
  }

  usePower(name, btn) {
    if (!this.engine || this.over || this.paused) return;
    audio.ensure();
    if (btn) {
      btn.classList.remove('is-flash');
      void btn.offsetWidth;
      btn.classList.add('is-flash');
    }

    if (name === 'hint') {
      if (!this.spend(COSTS.hint)) return;
      const h = this.engine.hint();
      if (!h) return;
      this.run.hints++;
      store.data.stats.hints++;
      store.touch();
      this.view.hint(h.cell, h.dir);
      audio.play('hint');
      haptic('power');
      this.setCaption('Follow the beam — that arrow is free');
      if (this.cursor.active) {
        this.cursor.x = h.cell % this.def.size;
        this.cursor.y = (h.cell / this.def.size) | 0;
        this.view.setCursor(this.cursor.x, this.cursor.y, true);
      }
      return;
    }

    if (name === 'undo') {
      if (!this.engine.history.length) {
        toast('Nothing to undo yet', { icon: '↩️' });
        return;
      }
      if (!this.spend(COSTS.undo)) return;
      const res = this.engine.undo();
      if (!res) return;
      this.run.undos++;
      store.data.stats.undos++;
      store.touch();
      this.view.restore(res.cell, res.dir);
      this.bumpScore();
      this.dom.moves.textContent = this.engine.moves;
      this.renderHearts();
      this.updateProgress();
      this.updateCoinUI();
      audio.play('undo');
      haptic('power');
      this.setCaption('Move undone');
      return;
    }

    if (name === 'shuffle') {
      if (this.engine.moves === 0 && this.engine.mistakes === 0) {
        toast('Board is already fresh', { icon: '🔀' });
        return;
      }
      openModal({
        title: 'Reshuffle board?',
        titleIcon: 'shuffle',
        sub: 'A brand new layout for this level. Lives are refilled, your score and timer keep running.',
        actions: [
          {
            label: 'Reshuffle',
            sub: `${COSTS.shuffle} coins`,
            variant: 'btn-primary',
            onClick: () => this.doShuffle(),
          },
          { label: 'Keep playing', variant: 'btn-ghost' },
        ],
      });
      return;
    }

    if (name === 'life') {
      if (this.engine.lives >= this.maxLives + 2) {
        toast('You are stacked with lives already', { icon: '❤️' });
        return;
      }
      if (!this.spend(COSTS.life)) return;
      this.engine.lives++;
      this.maxLives = Math.max(this.maxLives, this.engine.lives);
      this.run.lives++;
      store.data.stats.livesBought++;
      store.touch();
      this.renderHearts(true);
      this.updateCoinUI();
      audio.play('power');
      haptic('power');
      toast('+1 extra life', { icon: 'heart' });
    }
  }

  doShuffle() {
    if (!this.spend(COSTS.shuffle)) return;
    const salt = (Math.random() * 1e9) | 0;
    const board = generateBoard(this.def.size, mulberry32(salt));
    const def = { ...this.def, dirs: board.dirs, order: board.order, seed: salt };
    this.run.shuffles++;
    store.data.stats.shuffles++;
    store.touch();
    audio.play('shuffle');
    haptic('power');
    this.applyNewBoard(def);
    fx.burst(window.innerWidth / 2, window.innerHeight / 2, {
      count: 26,
      colors: ['#22d3ee', '#a78bfa', '#f0abfc'],
      speed: 420,
      size: 5,
      life: 0.7,
      gravity: 120,
    });
    fx.shake(this.dom.boardWrap, false);
  }

  /* ---------------- pause ---------------- */

  togglePause() {
    if (!this.engine || this.over) return;
    if (this.paused) this.resume();
    else this.pause();
  }

  pause() {
    if (!this.engine || this.over || this.paused) return;
    this.paused = true;
    this.pauseClock();
    this.showPauseModal();
    this.dom.pauseBtn.blur();
  }

  showPauseModal() {
    this.deferResume = false;
    openModal({
      title: 'Paused',
      sub: this.def.kind === 'daily' ? 'Daily puzzle' : `Level ${this.def.level} · ${DIFFICULTY_META[this.def.difficulty].label}`,
      bodyHTML: `
        <div class="stat-grid">
          <div class="stat-box"><span class="k">Score</span><span class="v">${this.engine.score.toLocaleString()}</span></div>
          <div class="stat-box"><span class="k">Time</span><span class="v">${fmtTime(this.elapsed())}</span></div>
          <div class="stat-box"><span class="k">Left</span><span class="v">${this.engine.remaining}</span></div>
          <div class="stat-box"><span class="k">Lives</span><span class="v">${'♥'.repeat(this.engine.lives) || '—'}</span></div>
        </div>`,
      actions: [
        { label: 'Resume', icon: 'play', variant: 'btn-primary', onClick: () => this.resume() },
        { label: 'Restart level', icon: 'refresh', onClick: () => this.restart() },
        {
          label: 'Settings',
          icon: 'gear',
          keepOpen: true,
          onClick: () => {
            this.deferResume = true;
            closeModal(true);
            this.app.openSettings({ fromGame: true });
          },
        },
        { label: 'Level map', icon: 'map', onClick: () => this.exit(true) },
      ],
      onClose: () => {
        if (this.deferResume || this.over) return;
        this.resume();
      },
    });
  }

  /** Called when a modal opened from the pause screen closes. */
  resumeFromSettings() {
    if (!this.isActive() || this.over) return;
    if (this.paused && !isModalOpen()) {
      this.deferResume = false;
      this.showPauseModal();
    }
  }

  resume() {
    if (!this.paused || this.over) return;
    this.paused = false;
    this.resumeClock();
  }

  exit(toMap = false) {
    this.stopClock();
    this.over = true;
    this.paused = false;
    closeModal(true);
    this.view.clearHint();
    if (toMap) this.app.showLevels();
    else this.app.showTitle();
    this.app.refreshMeta();
  }

  /* ---------------- results ---------------- */

  win() {
    if (this.over) return;
    this.over = true;
    this.pauseClock();
    if (this.timerHandle) clearInterval(this.timerHandle);

    const seconds = this.elapsed();
    const stars = ratingFor(this.def, { mistakes: this.engine.mistakes, seconds });
    const p0 = store.data;
    const dailyReplay = this.mode === 'daily' && p0.daily.day === this.def.day && p0.daily.cleared;
    const coins = dailyReplay ? 0 : coinsFor(this.def, stars);
    const timeBonus = Math.max(0, Math.round((this.def.par - seconds) * 6));
    const perfectBonus = this.engine.mistakes === 0 ? 150 : 0;
    const clearBonus = 200 + (this.def.challenge ? 150 : 0);
    const totalScore = this.engine.score + clearBonus + timeBonus + perfectBonus;

    const p = store.data;
    p.coins += coins;
    p.bestScore = Math.max(p.bestScore, totalScore);
    p.stats.cleared++;
    p.stats.escapes += this.engine.moves;
    p.stats.blocked += this.engine.mistakes;
    p.stats.bestCombo = Math.max(p.stats.bestCombo, this.engine.bestCombo);
    p.stats.totalTime += Math.round(seconds);
    p.stats.levelsByDiff[this.def.difficulty] = (p.stats.levelsByDiff[this.def.difficulty] || 0) + 1;
    if (this.engine.mistakes === 0) p.stats.perfects++;
    if (this.def.challenge && this.mode === 'level') p.stats.challenges++;
    if (this.run.hints === 0) p.stats.noHintClears++;
    if (this.mode === 'daily') {
      if (!dailyReplay) p.stats.dailyCleared++;
      p.daily.cleared = true;
      p.daily.day = this.def.day;
      p.daily.best = Math.max(p.daily.best, totalScore);
    } else {
      p.stars[this.def.level] = Math.max(p.stars[this.def.level] || 0, stars);
      p.current = Math.max(p.current, Math.min(this.def.level + 1, 520));
    }
    touchStreak(p);
    p.lastPlayed = dayKey();

    this.pushHighScore(totalScore, stars);

    // celebration
    audio.play('win');
    haptic('win');
    fx.shake(this.dom.boardWrap, true);
    const rect = this.dom.board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    fx.ring(cx, cy, '#fbbf24', { size: 20, grow: 520, life: 0.8, width: 4 });
    fx.confetti(window.innerWidth / 2, rect.top + rect.height * 0.55, { count: 60 });
    setTimeout(() => fx.confetti(window.innerWidth * 0.22, rect.bottom, { count: 26 }), 130);
    setTimeout(() => fx.confetti(window.innerWidth * 0.78, rect.bottom, { count: 26 }), 210);
    delay(() => audio.play('star'), 260);

    const unlocked = evaluateAchievements(p);
    if (unlocked.length) this.run.unlocked = (this.run.unlocked || []).concat(unlocked);
    store.touch();
    this.app.refreshMeta();

    delay(() => {
      this.showWinModal({ stars, coins, totalScore, timeBonus, perfectBonus, clearBonus, seconds, unlocked });
    }, REDUCED_MOTION ? 60 : 520);
  }

  pushHighScore(score, stars) {
    const p = store.data;
    const entry = {
      score,
      level: this.def.kind === 'daily' ? 'daily' : this.baseDef.level,
      stars,
      mode: this.mode,
      at: Date.now(),
    };
    // only a personal best per level deserves a line in the table
    const duel = p.highscores.find((e) => e.level === entry.level && e.mode === entry.mode);
    if (duel) {
      if (entry.score <= duel.score) return;
      p.highscores.splice(p.highscores.indexOf(duel), 1);
    }
    p.highscores.push(entry);
    p.highscores.sort((a, b) => b.score - a.score);
    p.highscores = p.highscores.slice(0, 10);
  }

  showWinModal(d) {
    const p = store.data;
    const starHtml = [0, 1, 2]
      .map((i) => `<span class="big-star ${i < d.stars ? 'on' : ''}" style="animation-delay:${i * 120}ms">★</span>`)
      .join('');

    const isDaily = this.mode === 'daily';
    const nextLevel = this.def.level + 1;
    const hasNext = !isDaily && nextLevel <= 520;
    const nextIsChallenge = hasNext && nextLevel % 10 === 0;

    const title = isDaily
      ? 'Daily <span class="accent">Solved</span>'
      : d.stars === 3
      ? 'Flawless <span class="accent">Escape</span>'
      : this.def.challenge
      ? 'Challenge <span class="accent">Crushed</span>'
      : 'Level <span class="accent">Cleared</span>';

    const actions = [];
    if (hasNext) {
      actions.push({
        label: nextIsChallenge ? `Challenge ${nextLevel}` : `Next level ${nextLevel}`,
        sub: nextIsChallenge ? 'Double coins await' : `${DIFFICULTY_META[this.def.difficulty].label} board cleared`,
        icon: nextIsChallenge ? 'crown' : 'play',
        variant: 'btn-primary',
        onClick: () => this.app.startLevel(nextLevel),
      });
    } else if (isDaily) {
      actions.push({
        label: 'Back to title',
        icon: 'home',
        variant: 'btn-primary',
        onClick: () => this.app.showTitle(),
      });
    }
    actions.push({ label: 'Replay level', icon: 'refresh', onClick: () => this.restart() });
    if (!isDaily) actions.push({ label: 'Level map', icon: 'map', onClick: () => this.app.showLevels() });

    openModal({
      title,
      sub: isDaily
        ? `Daily puzzle #${this.def.day}`
        : `Level ${this.def.level} · ${fmtTime(d.seconds)} · best combo ×${this.engine.bestCombo}`,
      bodyHTML: `
        <div class="stars-row">${starHtml}</div>
        <div class="reward-row">
          <span class="reward-pill gold"><span class="ico">${icon('coin')}</span>+${d.coins}</span>
          <span class="reward-pill cyan"><span class="ico">${icon('bolt')}</span>${d.totalScore.toLocaleString()} pts</span>
          <span class="reward-pill"><span class="ico">${icon('flame')}</span>${p.streak.count} day streak</span>
        </div>
        <div class="score-breakdown">
          <div class="sb-row"><span>Arrow points</span><b>${this.engine.score.toLocaleString()}</b></div>
          <div class="sb-row"><span>Clear bonus</span><b>+${d.clearBonus.toLocaleString()}</b></div>
          <div class="sb-row"><span>Speed bonus</span><b>+${d.timeBonus.toLocaleString()}</b></div>
          <div class="sb-row"><span>No-mistake bonus</span><b>+${d.perfectBonus}</b></div>
          <div class="sb-row total"><span>Total score</span><b>${d.totalScore.toLocaleString()}</b></div>
        </div>`,
      actions,
    });

    if (d.unlocked && d.unlocked.length) {
      d.unlocked.forEach((a, i) => {
        delay(() => {
          toast(`Achievement — ${a.name} +${a.reward} coins`, { icon: a.ico || 'medal', ms: 3000 });
          audio.play('achieve');
          haptic('star');
        }, 900 + i * 900);
      });
    }
    if (p.streak.count > 1 && !isDaily) {
      delay(() => toast(`${p.streak.count} day streak!`, { icon: 'flame', ms: 2200 }), 600);
    }
  }

  lose(reason) {
    if (this.over) return;
    this.over = true;
    this.reason = reason;
    this.pauseClock();
    if (this.timerHandle) clearInterval(this.timerHandle);

    audio.play('lose');
    haptic('lose');
    fx.shake(this.dom.boardWrap, true);
    fx.burst(window.innerWidth / 2, window.innerHeight / 2, {
      count: 20,
      colors: ['#fb7185', '#ff5470'],
      speed: 300,
      size: 4,
      life: 0.7,
      gravity: 200,
    });

    const p = store.data;
    const canContinue = p.coins >= COSTS.life;
    const title = reason === 'time' ? 'Time&rsquo;s Up' : 'Out of Lives';
    const sub =
      reason === 'time'
        ? 'The clock beat you — but the board is still here.'
        : 'Too many blocked lanes. Shake it off and jump back in.';

    openModal({
      title,
      sub,
      bodyHTML: `
        <div class="stat-grid">
          <div class="stat-box"><span class="k">Score</span><span class="v">${this.engine.score}</span></div>
          <div class="stat-box"><span class="k">Arrows left</span><span class="v">${this.engine.remaining}</span></div>
          <div class="stat-box"><span class="k">Moves</span><span class="v">${this.engine.moves}</span></div>
          <div class="stat-box"><span class="k">Blocks</span><span class="v">${this.engine.mistakes}</span></div>
        </div>`,
      actions: [
        canContinue
          ? {
              label: 'Continue',
              sub: `+1 life${reason === 'time' ? ' · +60s' : ''} · ${COSTS.life} coins`,
              icon: 'heart',
              variant: 'btn-primary',
              keepOpen: true,
              onClick: () => {
                if (!this.spend(COSTS.life)) return;
                closeModal();
                this.revive();
              },
            }
          : {
              label: 'Retry instantly',
              sub: 'Free restart',
              icon: 'refresh',
              variant: 'btn-primary',
              onClick: () => this.restart(),
            },
        canContinue ? { label: 'Retry instantly', icon: 'refresh', onClick: () => this.restart() } : null,
        { label: 'Level map', icon: 'map', onClick: () => this.app.showLevels() },
      ].filter(Boolean),
    });
  }

  revive() {
    this.over = false;
    this.paused = false;
    this.engine.lives = 1;
    this.maxLives = Math.max(this.maxLives, 1);
    if (this.reason === 'time') {
      this.def = { ...this.def, timeLimit: Math.max(60, this.elapsed() + 60) };
    }
    this.renderHearts(true);
    this.updateCoinUI();
    this.resumeClock();
    this.startClock();
    this.setCaption('Back in the game');
    audio.play('power');
    haptic('win');
  }

  /* ---------------- keyboard ---------------- */

  handleKey(ev) {
    if (!this.isActive() || this.over) return false;
    const k = ev.key;
    const lower = k.toLowerCase();

    if (lower === 'p' || k === 'Escape') {
      this.togglePause();
      return true;
    }
    if (this.paused) return false;

    if (lower === 'h') {
      this.usePower('hint', document.querySelector('.power[data-power="hint"]'));
      return true;
    }
    if (lower === 'z') {
      this.usePower('undo', document.querySelector('.power[data-power="undo"]'));
      return true;
    }
    if (lower === 'r') {
      this.usePower('shuffle', document.querySelector('.power[data-power="shuffle"]'));
      return true;
    }
    if (lower === 'l') {
      this.usePower('life', document.querySelector('.power[data-power="life"]'));
      return true;
    }

    const moves = {
      arrowup: [0, -1],
      w: [0, -1],
      arrowdown: [0, 1],
      s: [0, 1],
      arrowleft: [-1, 0],
      a: [-1, 0],
      arrowright: [1, 0],
      d: [1, 0],
    };

    if (moves[k] || moves[lower]) {
      const [dx, dy] = moves[k] || moves[lower];
      ev.preventDefault();
      if (!this.cursor.active) {
        this.cursor.active = true;
        this.view.setCursor(this.cursor.x, this.cursor.y, true);
      }
      this.cursor.x = clamp(this.cursor.x + dx, 0, this.def.size - 1);
      this.cursor.y = clamp(this.cursor.y + dy, 0, this.def.size - 1);
      this.view.setCursor(this.cursor.x, this.cursor.y, true);
      audio.play('tap');
      return true;
    }

    if (k === 'Enter' || k === ' ') {
      ev.preventDefault();
      if (!this.cursor.active) {
        this.cursor.active = true;
        this.view.setCursor(this.cursor.x, this.cursor.y, true);
        return true;
      }
      const cell = this.cursor.y * this.def.size + this.cursor.x;
      if (!this.engine.alive[cell]) {
        audio.play('tap');
        return true;
      }
      const c = this.view.cellCenter(cell);
      this.onTap(cell, c ? c.x : 0, c ? c.y : 0);
      return true;
    }
    return false;
  }
}

function delay(fn, ms) {
  setTimeout(fn, ms);
}
