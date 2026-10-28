/* ============================================================
   main.js — app shell: screens, level map, rewards, settings
   ============================================================ */

import { store } from './storage.js';
import { audio } from './audio.js';
import { haptic } from './haptics.js';
import { initFx, confetti, coinPop, clearFx } from './fx.js';
import { toast, openModal, closeModal, isModalOpen } from './ui.js';
import {
  getLevel,
  getDaily,
  allChapters,
  DIFFICULTY_META,
  TOTAL_LEVELS,
  tunings,
  LEVELS_PER_CHAPTER,
} from './levels.js';
import {
  ACHIEVEMENTS,
  LOGIN_REWARDS,
  canClaimLogin,
  claimLogin,
  evaluateAchievements,
  totalStars,
  clearedCount,
  makeCtx,
  achievementState,
} from './achievements.js';
import { Game } from './game.js';
import { dayKey, fmtTime, el, $$, starsRow } from './utils.js';
import { icon, hydrateIcons } from './icons.js';

/* ------------------------------------------------------------------
   screens
   ------------------------------------------------------------------ */

const screenIds = { title: 'screen-title', levels: 'screen-levels', game: 'screen-game' };
let currentScreen = 'title';

function showScreen(name) {
  if (!screenIds[name]) return;
  Object.entries(screenIds).forEach(([key, id]) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.classList.toggle('is-active', key === name);
    if (key === name) node.setAttribute('aria-hidden', 'false');
    else node.setAttribute('aria-hidden', 'true');
  });
  currentScreen = name;
  document.body.dataset.screen = name;
}

/* ------------------------------------------------------------------
   app api
   ------------------------------------------------------------------ */

const app = {};

function refreshMeta() {
  const p = store.data;
  const set = (id, val) => {
    const n = document.getElementById(id);
    if (n) n.textContent = val;
  };
  set('meta-best', (p.bestScore || 0).toLocaleString());
  set('meta-coins', p.coins);
  set('meta-streak', p.streak.count || 0);
  set('meta-stars', totalStars(p));

  const nextLevel = Math.min(p.current || 1, TOTAL_LEVELS);
  const t = tunings(nextLevel);
  const hasProgress = clearedCount(p) > 0 || (p.current || 1) > 1;
  const cLabel = document.getElementById('continue-label');
  const cSub = document.getElementById('continue-sub');
  if (cLabel) cLabel.textContent = hasProgress ? 'Continue' : 'Start playing';
  if (cSub) {
    cSub.textContent = hasProgress
      ? `Level ${nextLevel}${t.challenge ? ' · challenge' : ''} · ${DIFFICULTY_META[t.diff].label}`
      : 'Level 1 · Easy · 25 arrows';
  }

  const today = dayKey();
  const dailyDone = p.daily.day === today && p.daily.cleared;
  set('daily-sub', dailyDone ? 'Solved today — come back tomorrow' : `Daily puzzle · ${fmtTime(150)} limit`);
  const dot = document.getElementById('daily-dot');
  if (dot) dot.hidden = dailyDone;

  const claimable = canClaimLogin(p);
  const rSub = document.getElementById('rewards-sub');
  if (rSub) rSub.textContent = claimable ? 'Claim your coins' : 'Claimed today — back tomorrow';
  const rDot = document.getElementById('rewards-dot');
  if (rDot) rDot.hidden = !claimable;

  const coinEls = $$('#coin-count');
  coinEls.forEach((n) => (n.textContent = p.coins));

  if (currentScreen === 'levels') renderLevelMap();
}

function showTitle() {
  closeModal(true);
  showScreen('title');
  refreshMeta();
  audio.play('ui');
}

function showLevels() {
  closeModal(true);
  showScreen('levels');
  renderLevelMap();
  audio.play('ui');
  requestAnimationFrame(() => scrollToCurrent());
}

let lastFilter = 'all';
let scrollTarget = 0;

function renderLevelMap() {
  const p = store.data;
  const list = document.getElementById('level-list');
  if (!list) return;
  const unlockedUpTo = Math.max(1, p.current || 1);
  const cleared = clearedCount(p);
  const summary = document.getElementById('levels-summary');
  if (summary) summary.textContent = `${cleared} / ${TOTAL_LEVELS} cleared · ${totalStars(p)} ★`;
  const prog = document.getElementById('levels-progress');
  if (prog) prog.style.width = `${(cleared / TOTAL_LEVELS) * 100}%`;

  const frag = document.createDocumentFragment();
  for (const ch of allChapters()) {
    if (lastFilter !== 'all' && ch.difficulty !== lastFilter) continue;
    const section = el('section', 'chapter');
    section.dataset.chapter = ch.chapter;
    const head = el('header', 'chapter-head');
    head.innerHTML = `<span class="chapter-name">${ch.chapter}. ${ch.name}</span><span class="chapter-desc">${DIFFICULTY_META[ch.difficulty].label} · ${ch.first}–${ch.last}</span>`;
    section.appendChild(head);

    const grid = el('div', 'level-grid');
    for (let lv = ch.first; lv <= ch.last; lv++) {
      const stars = p.stars[lv] || 0;
      const locked = lv > unlockedUpTo;
      const isNext = lv === unlockedUpTo;
      const isChallenge = lv % LEVELS_PER_CHAPTER === 0;
      const btn = el(
        'button',
        `lv${locked ? ' is-locked' : ''}${stars ? ' is-clear' : ''}${isNext ? ' is-next' : ''}${isChallenge ? ' is-challenge' : ''}`
      );
      btn.dataset.level = lv;
      btn.disabled = locked;
      btn.setAttribute(
        'aria-label',
        `Level ${lv}${locked ? ' locked' : stars ? `, ${stars} stars` : ''}${isChallenge ? ', challenge' : ''}`
      );
      btn.innerHTML = locked
        ? `<span class="lv-lock">${icon('lock')}</span>`
        : `<span class="lv-num">${lv}</span><span class="lv-stars">${starsRow(stars)}</span>`;
      btn.addEventListener('click', () => startLevel(lv));
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    frag.appendChild(section);
  }
  list.replaceChildren(frag);
}

function scrollToCurrent() {
  const scroll = document.getElementById('level-scroll');
  const target = document.querySelector('.lv.is-next');
  if (!scroll || !target) return;
  const top = target.offsetTop - scroll.clientHeight / 2 + target.offsetHeight / 2;
  scroll.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function startLevel(level) {
  const def = getLevel(level);
  closeModal(true);
  clearFx();
  showScreen('game');
  game.start(def, 'level');
  audio.play('ui');
}

function startDaily() {
  const key = dayKey();
  const def = getDaily(key);
  closeModal(true);
  clearFx();
  showScreen('game');
  game.start(def, 'daily');
  audio.play('ui');
}

/* ------------------------------------------------------------------
   daily login reward
   ------------------------------------------------------------------ */

function openLoginRewards(auto = false) {
  const p = store.data;
  const claimable = canClaimLogin(p);
  const idx = p.rewards.lastClaimDay
    ? (p.rewards.index + 1) % 7
    : 0;

  const days = LOGIN_REWARDS.map((r, i) => {
    const isToday = i === (claimable ? idx % 7 : p.rewards.index);
    const claimed = !claimable && i === p.rewards.index;
    return `<div class="day${isToday ? ' is-today' : ''}${claimed ? ' is-claimed' : ''}">
      <span class="d-num">Day ${r.day}</span>
      <span class="d-val">${icon('coin')} ${r.coins}</span>
    </div>`;
  }).join('');

  openModal({
    title: 'Daily Reward',
    titleIcon: 'gift',
    sub: claimable
      ? 'Come back every day — the streak rewards get bigger.'
      : 'Already claimed today. See you tomorrow!',
    bodyHTML: `
      <div class="day-grid">${days}</div>
      <div class="reward-row" style="margin-top:12px">
        <span class="reward-pill"><span class="ico">${icon('flame')}</span>${p.streak.count || 0} day streak</span>
      </div>`,
    actions: claimable
      ? [
          {
            label: 'Claim reward',
            variant: 'btn-primary',
            icon: 'coin',
            keepOpen: true,
            onClick: () => {
              const r = claimLogin(p);
              if (!r) return;
              store.touch();
              audio.play('coin');
              haptic('coin');
              fxSafe(() => {
                confetti(window.innerWidth / 2, window.innerHeight * 0.62, { count: 40 });
                coinPop(window.innerWidth / 2, window.innerHeight * 0.5);
              });
              refreshMeta();
              toast(`+${r.coins} coins claimed!`, { icon: 'gift' });
              openLoginRewards();
            },
          },
          { label: 'Later', variant: 'btn-ghost' },
        ]
      : [{ label: 'Nice', variant: 'btn-primary' }],
  });
}

function fxSafe(fn) {
  try {
    fn();
  } catch (e) {
    /* noop */
  }
}

/* ------------------------------------------------------------------
   settings
   ------------------------------------------------------------------ */

function settingRow(name, desc, on) {
  return `<div class="setting-row">
    <div class="setting-text"><span class="setting-name">${name}</span><span class="setting-desc">${desc}</span></div>
    <button class="switch" role="switch" aria-checked="${on}" aria-label="${name}"></button>
  </div>`;
}

function openSettings(opts = {}) {
  const s = store.settings;
  openModal({
    title: 'Settings',
    titleIcon: 'gear',
    bodyHTML: `
      <div class="setting-list">
        ${settingRow('Sound effects', 'Flying arrows, combos, blocks', s.sound)}
        ${settingRow('Music', 'Chilled synth loop', s.music)}
        ${settingRow('Vibration', 'Haptic taps on mobile', s.haptics)}
        <div class="setting-row">
          <div class="setting-text"><span class="setting-name">Theme</span><span class="setting-desc">Neon dark or clean light</span></div>
          <div class="seg" id="theme-seg">
            <button data-theme-choice="dark" class="${s.theme === 'dark' ? 'is-active' : ''}">Dark</button>
            <button data-theme-choice="light" class="${s.theme === 'light' ? 'is-active' : ''}">Light</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-ghost" id="btn-reset-progress" style="flex:1">Reset progress</button>
      </div>
      <p style="text-align:center;color:var(--muted);font-size:.7rem;margin-top:14px">
        Arrow Escape v1.0 · progress saved on this device
      </p>`,
    actions: [{ label: 'Done', variant: 'btn-primary' }],
    onClose: () => {
      if (opts.fromGame) game.resumeFromSettings();
    },
    mount: (modal) => {
      const switches = modal.querySelectorAll('.switch');
      const keys = ['sound', 'music', 'haptics'];
      switches.forEach((sw, i) => {
        sw.addEventListener('click', () => {
          const key = keys[i];
          const next = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', String(next));
          s[key] = next;
          store.touch();
          if (key === 'sound') {
            audio.setSfxEnabled(next);
            if (next) audio.play('ui');
          }
          if (key === 'music') {
            audio.ensure();
            audio.setMusicEnabled(next);
          }
          if (key === 'haptics' && next) haptic('tap');
        });
      });

      modal.querySelectorAll('[data-theme-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.dataset.themeChoice;
          s.theme = t;
          applyTheme();
          store.touch();
          modal.querySelectorAll('[data-theme-choice]').forEach((b) => b.classList.toggle('is-active', b === btn));
          audio.play('ui');
        });
      });

      modal.querySelector('#btn-reset-progress').addEventListener('click', () => {
        openModal({
          title: 'Reset everything?',
          sub: 'Levels, stars, coins, achievements and high scores on this device will be erased. This cannot be undone.',
          actions: [
            {
              label: 'Yes, wipe my profile',
              variant: 'btn-primary',
              onClick: () => {
                store.reset();
                applyTheme();
                refreshMeta();
                toast('Profile reset', { icon: 'refresh' });
                showTitle();
              },
            },
            { label: 'Cancel' },
          ],
        });
      });
    },
  });
}

function applyTheme() {
  const t = store.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#eef2fd' : '#070b18');
}

/* ------------------------------------------------------------------
   stats + achievements
   ------------------------------------------------------------------ */

function openStats(tab = 'overview') {
  const p = store.data;
  const ctx = makeCtx(p);
  const tabsHtml = `
    <div class="tabs" id="stat-tabs">
      <button class="tab ${tab === 'overview' ? 'is-active' : ''}" data-tab="overview">Overview</button>
      <button class="tab ${tab === 'scores' ? 'is-active' : ''}" data-tab="scores">Scores</button>
      <button class="tab ${tab === 'achv' ? 'is-active' : ''}" data-tab="achv">Awards</button>
    </div>`;

  const bodyFor = (which) => {
    if (which === 'scores') {
      const list = p.highscores || [];
      if (!list.length) return `<p class="modal-sub" style="margin:6px 0">No runs yet — clear a level to set a score.</p>`;
      return `<div class="list">${list
        .slice(0, 8)
        .map(
          (s, i) => `<div class="list-item">
            <span class="li-rank ${i === 0 ? 'top1' : ''}">${i + 1}</span>
            <div class="li-body">
              <div class="li-name">${s.mode === 'daily' ? 'Daily puzzle' : `Level ${s.level}`}</div>
              <div class="li-desc">${starsRow(s.stars)} · ${new Date(s.at).toLocaleDateString()}</div>
            </div>
            <span class="li-val">${s.score.toLocaleString()}</span>
          </div>`
        )
        .join('')}</div>`;
    }
    if (which === 'achv') {
      return `<div class="list">${ACHIEVEMENTS.map((a) => {
        const st = achievementState(a, ctx);
        return `<div class="list-item ${st.done ? 'is-done' : ''}">
          <span class="li-ico ${st.done ? 'is-on' : ''}">${icon(a.ico || 'star')}</span>
          <div class="li-body">
            <div class="li-name">${a.name}</div>
            <div class="li-desc">${a.desc}</div>
          </div>
          <span class="li-val">${st.done ? '✔' : `${Math.floor(st.have)}/${st.need}`}</span>
        </div>`;
      }).join('')}</div>`;
    }
    const acc = p.stats.escapes + p.stats.blocked ? Math.round((p.stats.escapes / (p.stats.escapes + p.stats.blocked)) * 100) : 100;
    return `
      <div class="stat-grid">
        <div class="stat-box"><span class="k">Levels cleared</span><span class="v">${ctx.cleared}</span></div>
        <div class="stat-box"><span class="k">Stars</span><span class="v">${ctx.stars}</span></div>
        <div class="stat-box"><span class="k">Best score</span><span class="v">${(p.bestScore || 0).toLocaleString()}</span></div>
        <div class="stat-box"><span class="k">Day streak</span><span class="v">${p.streak.count || 0} 🔥</span></div>
        <div class="stat-box"><span class="k">Best combo</span><span class="v">×${p.stats.bestCombo || 0}</span></div>
        <div class="stat-box"><span class="k">Blocks</span><span class="v">${p.stats.blocked || 0}</span></div>
        <div class="stat-box"><span class="k">Flawless</span><span class="v">${p.stats.perfects || 0}</span></div>
        <div class="stat-box"><span class="k">Play time</span><span class="v">${fmtTime(p.stats.totalTime || 0)}</span></div>
        <div class="stat-box"><span class="k">Challenges</span><span class="v">${p.stats.challenges || 0}</span></div>
        <div class="stat-box"><span class="k">Hints used</span><span class="v">${p.stats.hints || 0}</span></div>
        <div class="stat-box"><span class="k">Dailies</span><span class="v">${p.stats.dailyCleared || 0}</span></div>
        <div class="stat-box"><span class="k">Accuracy</span><span class="v">${acc}%</span></div>
      </div>
      <p style="text-align:center;color:var(--muted);font-size:.72rem;margin-top:2px;line-height:1.6">Coins <b style="color:var(--amber)">${p.coins}</b> · Achievements <b style="color:var(--text)">${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}</b> · Levels <b style="color:var(--text)">${ctx.cleared}/${TOTAL_LEVELS}</b></p>`;
  };

  openModal({
    title: 'Your Stats',
    titleIcon: 'trophy',
    bodyHTML: `${tabsHtml}<div id="stat-body">${bodyFor(tab)}</div>`,
    actions: [{ label: 'Close' }],
    mount: (modal) => {
      modal.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          modal.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
          modal.querySelector('#stat-body').innerHTML = bodyFor(btn.dataset.tab);
          audio.play('ui');
        });
      });
    },
  });
}

function openHowTo() {
  openModal({
    title: 'How to play',
    titleIcon: 'help',
    bodyHTML: `
      <div class="mini-board">
        <span class="mini-cell">↑</span><span class="mini-cell up">↑</span><span class="mini-cell">↓</span><span class="mini-cell">←</span>
        <span class="mini-cell">←</span><span class="mini-cell">↑</span><span class="mini-cell up">→</span><span class="mini-cell">↓</span>
        <span class="mini-cell bad">→</span><span class="mini-cell">↑</span><span class="mini-cell">↓</span><span class="mini-cell">←</span>
        <span class="mini-cell">↑</span><span class="mini-cell">←</span><span class="mini-cell">↑</span><span class="mini-cell">→</span>
      </div>
      <div class="steps">
        <div class="step"><span class="step-num">1</span><div class="step-body"><b>Tap an arrow</b> and it flies out in the direction it points — but only if its lane is clear.</div></div>
        <div class="step"><span class="step-num">2</span><div class="step-body"><b>Clear the whole board.</b> Arrows fire in lanes that wrap every 3rd column/row, so an arrow can sit <i>behind</i> a distant blocker.</div></div>
        <div class="step"><span class="step-num">3</span><div class="step-body"><b>Blocked arrows</b> cost a heart. Each level gives you a few.</div></div>
        <div class="step"><span class="step-num">4</span><div class="step-body">Chain escapes for a <b>combo</b>, beat the par time, and earn up to <b>3 stars</b>.</div></div>
      </div>
      <hr style="border:0;border-top:1px solid var(--stroke);margin:14px 0">
      <div class="kb-list">
        <span class="kb-key">↑ ↓ ← →</span><span class="kb-desc">Move cursor</span>
        <span class="kb-key">Enter</span><span class="kb-desc">Fire arrow</span>
        <span class="kb-key">H</span><span class="kb-desc">Hint</span>
        <span class="kb-key">Z</span><span class="kb-desc">Undo</span>
        <span class="kb-key">R</span><span class="kb-desc">Reshuffle</span>
        <span class="kb-key">L</span><span class="kb-desc">Extra life</span>
        <span class="kb-key">P / Esc</span><span class="kb-desc">Pause</span>
      </div>`,
    actions: [{ label: 'Got it', variant: 'btn-primary' }],
  });
}

/* ------------------------------------------------------------------
   boot
   ------------------------------------------------------------------ */

const game = new Game(app);

Object.assign(app, {
  showTitle,
  showLevels,
  startLevel,
  startDaily,
  openSettings,
  refreshMeta,
});

function bind() {
  const on = (id, ev, fn) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener(ev, fn);
  };

  on('btn-continue', 'click', () => {
    const p = store.data;
    startLevel(Math.min(p.current || 1, TOTAL_LEVELS));
  });
  on('btn-daily', 'click', () => startDaily());
  on('btn-levels', 'click', () => showLevels());
  on('btn-stats', 'click', () => openStats('overview'));
  on('btn-settings', 'click', () => openSettings());
  on('btn-howto', 'click', () => openHowTo());
  on('btn-rewards', 'click', () => openLoginRewards());
  on('btn-levels-back', 'click', () => showTitle());
  on('btn-levels-settings', 'click', () => openSettings());
  on('btn-levels-stats', 'click', () => openStats('overview'));

  document.querySelectorAll('#filter-row .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      lastFilter = chip.dataset.filter;
      document.querySelectorAll('#filter-row .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      renderLevelMap();
      audio.play('ui');
      const scroll = document.getElementById('level-scroll');
      if (scroll) scroll.scrollTop = 0;
    });
  });

  // audio unlock on first interaction
  const unlock = () => {
    audio.ensure();
    if (store.settings.music) audio.setMusicEnabled(true);
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  // global keyboard
  document.addEventListener('keydown', (ev) => {
    if (isModalOpen()) return;
    if (currentScreen === 'game') {
      if (game.handleKey(ev)) ev.preventDefault();
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (currentScreen === 'title') {
        ev.preventDefault();
        startLevel(Math.min(store.data.current || 1, TOTAL_LEVELS));
      }
    }
    if (ev.key === 'Escape' && currentScreen === 'levels') showTitle();
  });

  // pause when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.stopMusic();
    else if (store.settings.music && audio.ready) audio.setMusicEnabled(true);
  });

  // lock zoom gestures on mobile
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // make sure nothing is lost if the tab is closed mid-run
  window.addEventListener('pagehide', () => store.save());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) store.save();
  });
}

function init() {
  hydrateIcons();
  applyTheme();
  initFx(document.getElementById('fx-canvas'));
  bind();

  const p = store.data;
  if (!p.createdAt) {
    p.createdAt = dayKey();
    p.coins = Math.max(p.coins, 120);
    store.save();
  }
  if (!p.seenHowto && p.stats.plays === 0) {
    setTimeout(() => {
      if (currentScreen === 'title' && !isModalOpen()) {
        openHowTo();
        p.seenHowto = true;
        store.touch();
      }
    }, 900);
  } else if (canClaimLogin(p)) {
    setTimeout(() => {
      if (currentScreen === 'title' && !isModalOpen()) openLoginRewards(true);
    }, 800);
  }

  evaluateAchievements(p);
  refreshMeta();
  showScreen('title');

  // service worker (offline support)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();

// debug hook for tests / console tinkering
window.__arrowEscape = { app, game, store };
