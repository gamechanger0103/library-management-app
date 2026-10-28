/* ============================================================
   achievements.js — unlockable goals, streak + daily rewards
   ============================================================ */

import { dayKey, dayNumber } from './utils.js';

export function totalStars(profile) {
  let t = 0;
  for (const k in profile.stars) t += profile.stars[k] || 0;
  return t;
}

export function clearedCount(profile) {
  return Object.keys(profile.stars).length;
}

/** ctx used by every achievement check */
export function makeCtx(profile) {
  return { p: profile, stars: totalStars(profile), cleared: clearedCount(profile) };
}

export const ACHIEVEMENTS = [
  { id: 'first', ico: 'play', icon: '🚀', name: 'First Escape', desc: 'Clear level 1', reward: 25, need: 1, value: (c) => c.cleared },
  { id: 'ten', ico: 'flame', icon: '🔥', name: 'Getting Warm', desc: 'Clear 10 levels', reward: 60, need: 10, value: (c) => c.cleared },
  { id: 'fifty', ico: 'target', icon: '🏹', name: 'Arrow Adept', desc: 'Clear 50 levels', reward: 150, need: 50, value: (c) => c.cleared },
  { id: 'hundred', ico: 'medal', icon: '💯', name: 'Centurion', desc: 'Clear 100 levels', reward: 300, need: 100, value: (c) => c.cleared },
  { id: 'flawless', ico: 'gem', icon: '💎', name: 'Flawless', desc: 'Clear a level without a blocked move', reward: 40, need: 1, value: (c) => c.p.stats.perfects },
  { id: 'precision', ico: 'sparkle', icon: '✨', name: 'Precision', desc: 'Clear 10 flawless levels', reward: 160, need: 10, value: (c) => c.p.stats.perfects },
  { id: 'chain', ico: 'bolt', icon: '⚡', name: 'Chain Reaction', desc: 'Reach a 10 arrow combo', reward: 80, need: 10, value: (c) => c.p.stats.bestCombo },
  { id: 'chain2', ico: 'bolt', icon: '🌪️', name: 'Unbroken', desc: 'Reach a 20 arrow combo', reward: 200, need: 20, value: (c) => c.p.stats.bestCombo },
  { id: 'boss', ico: 'crown', icon: '👑', name: 'Boss Slayer', desc: 'Clear a special challenge level', reward: 120, need: 1, value: (c) => c.p.stats.challenges },
  { id: 'boss5', ico: 'trophy', icon: '🏆', name: 'Challenge Hunter', desc: 'Clear 5 challenge levels', reward: 300, need: 5, value: (c) => c.p.stats.challenges },
  { id: 'streak3', ico: 'calendar', icon: '📅', name: 'On a Roll', desc: 'Play 3 days in a row', reward: 60, need: 3, value: (c) => c.p.streak.best },
  { id: 'streak7', ico: 'calendar', icon: '🗓️', name: 'Week Warrior', desc: 'Play 7 days in a row', reward: 180, need: 7, value: (c) => c.p.streak.best },
  { id: 'streak30', ico: 'flame', icon: '🌟', name: 'Unstoppable', desc: 'Play 30 days in a row', reward: 600, need: 30, value: (c) => c.p.streak.best },
  { id: 'daily1', ico: 'target', icon: '🎯', name: 'Daily Ritual', desc: 'Solve a daily puzzle', reward: 90, need: 1, value: (c) => c.p.stats.dailyCleared },
  { id: 'daily7', ico: 'calendar', icon: '🧿', name: 'Daily Devotee', desc: 'Solve 7 daily puzzles', reward: 260, need: 7, value: (c) => c.p.stats.dailyCleared },
  { id: 'stars100', ico: 'star', icon: '⭐', name: 'Star Collector', desc: 'Earn 100 stars', reward: 120, need: 100, value: (c) => c.stars },
  { id: 'stars500', ico: 'star', icon: '🌌', name: 'Constellation', desc: 'Earn 500 stars', reward: 400, need: 500, value: (c) => c.stars },
  { id: 'expert1', ico: 'gem', icon: '🧠', name: 'Expert Entry', desc: 'Clear an expert level', reward: 150, need: 1, value: (c) => c.p.stats.levelsByDiff.expert || 0 },
  { id: 'sharp', ico: 'bulb', icon: '👁️', name: 'Sharp Eyes', desc: 'Clear 10 levels with no hints', reward: 200, need: 10, value: (c) => c.p.stats.noHintClears || 0 },
  { id: 'rich', ico: 'coin', icon: '💰', name: 'Coin Vault', desc: 'Hold 1000 coins', reward: 250, need: 1000, value: (c) => c.p.coins },
];

export function achievementState(def, ctx) {
  const v = Math.min(def.need, def.value(ctx) || 0);
  return { have: v, need: def.need, done: !!ctx.p.achievements[def.id] };
}

/** Unlocks anything newly earned. Returns the unlocked definitions. */
export function evaluateAchievements(profile) {
  const ctx = makeCtx(profile);
  const unlocked = [];
  for (const def of ACHIEVEMENTS) {
    if (profile.achievements[def.id]) continue;
    const val = def.value(ctx) || 0;
    if (val >= def.need) {
      profile.achievements[def.id] = dayKey();
      profile.coins += def.reward;
      unlocked.push(def);
      // keep ctx fresh (coins/stars changed)
      ctx.p = profile;
      ctx.stars = totalStars(profile);
      ctx.cleared = clearedCount(profile);
    }
  }
  return unlocked;
}

/* ------------------------------------------------------------------
   streaks — a "day" counts once something is completed
   ------------------------------------------------------------------ */

export function touchStreak(profile, ref = new Date()) {
  const today = dayKey(ref);
  if (profile.streak.lastDay === today) return { changed: false, count: profile.streak.count };
  const diff = profile.streak.lastDay ? dayNumber(today) - dayNumber(profile.streak.lastDay) : Infinity;
  profile.streak.count = diff === 1 ? profile.streak.count + 1 : 1;
  profile.streak.lastDay = today;
  profile.streak.best = Math.max(profile.streak.best, profile.streak.count);
  return { changed: true, count: profile.streak.count, best: profile.streak.best };
}

export function streakIsAlive(profile, ref = new Date()) {
  if (!profile.streak.lastDay) return false;
  const diff = dayNumber(dayKey(ref)) - dayNumber(profile.streak.lastDay);
  return diff <= 1;
}

/* ------------------------------------------------------------------
   daily login calendar (7 day cycle)
   ------------------------------------------------------------------ */

export const LOGIN_REWARDS = [
  { day: 1, coins: 25 },
  { day: 2, coins: 40 },
  { day: 3, coins: 60 },
  { day: 4, coins: 90, powerup: 'hint' },
  { day: 5, coins: 130 },
  { day: 6, coins: 180 },
  { day: 7, coins: 300, powerup: 'life' },
];

export function canClaimLogin(profile, ref = new Date()) {
  return profile.rewards.lastClaimDay !== dayKey(ref);
}

export function claimLogin(profile, ref = new Date()) {
  const today = dayKey(ref);
  if (profile.rewards.lastClaimDay === today) return null;
  const yesterday = dayNumber(today) - 1;
  const last = profile.rewards.lastClaimDay ? dayNumber(profile.rewards.lastClaimDay) : null;
  // continue the cycle only if yesterday was claimed (otherwise restart)
  profile.rewards.index = last === yesterday ? (profile.rewards.index + 1) % 7 : 0;
  const reward = LOGIN_REWARDS[profile.rewards.index];
  profile.rewards.lastClaimDay = today;
  profile.coins += reward.coins;
  return { ...reward, index: profile.rewards.index };
}
