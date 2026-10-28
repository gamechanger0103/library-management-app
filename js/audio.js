/* ============================================================
   audio.js — 100% synthesised sound (no asset downloads)
   SFX + a slow generative music bed.
   ============================================================ */

import { store } from './storage.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicTimer = null;
    this.musicPlaying = false;
    this.step = 0;
    this.nextTime = 0;
    this.ready = false;
  }

  /** Must be called from a user gesture at least once. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 22;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      master.connect(comp);
      comp.connect(ctx.destination);
      this.master = master;

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = store.settings.sound ? 0.85 : 0;
      this.sfxGain.connect(master);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(master);

      // shared noise buffer
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.ready = true;
      return ctx;
    } catch (e) {
      return null;
    }
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /* ---------------- primitives ---------------- */

  tone({ freq, to, dur = 0.2, type = 'sine', gain = 0.15, attack = 0.006, at = 0, pan = 0, filter = 0, q = 1, detune = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = this.t + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    if (detune) osc.detune.value = detune;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t0);
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.15, gain = 0.1, type = 'bandpass', freq = 1200, to, q = 1, at = 0, pan = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t0 = this.t + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------------- sfx ---------------- */

  play(name, opt = {}) {
    if (!store.settings.sound) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const v = opt.level || 0;

    switch (name) {
      case 'ui':
        this.tone({ freq: 620, to: 760, dur: 0.07, type: 'sine', gain: 0.07 });
        break;

      case 'tap':
        this.tone({ freq: 480, to: 560, dur: 0.06, type: 'sine', gain: 0.06 });
        break;

      case 'fly': {
        const base = 340 + Math.min(v, 9) * 26;
        this.tone({ freq: base, to: base * 3.1, dur: 0.17, type: 'triangle', gain: 0.13 });
        this.tone({ freq: base * 2, to: base * 4, dur: 0.12, type: 'sine', gain: 0.045 });
        this.noise({ dur: 0.2, gain: 0.075, type: 'bandpass', freq: 2600, to: 700, q: 1.4 });
        break;
      }

      case 'blocked':
        this.tone({ freq: 190, to: 68, dur: 0.24, type: 'sawtooth', gain: 0.16, filter: 820, q: 5 });
        this.tone({ freq: 96, to: 52, dur: 0.26, type: 'square', gain: 0.08, filter: 500 });
        this.noise({ dur: 0.2, gain: 0.14, type: 'lowpass', freq: 900, to: 180 });
        break;

      case 'combo': {
        const n = Math.min(v, 10);
        const f = 660 * Math.pow(1.0595, n * 2);
        this.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.1 });
        this.tone({ freq: f * 1.5, dur: 0.12, type: 'sine', gain: 0.05, at: 0.02 });
        break;
      }

      case 'power':
        this.tone({ freq: 300, to: 1500, dur: 0.3, type: 'triangle', gain: 0.12 });
        this.tone({ freq: 600, to: 2400, dur: 0.28, type: 'sine', gain: 0.06, at: 0.02 });
        this.noise({ dur: 0.34, gain: 0.06, type: 'highpass', freq: 1800, to: 6000 });
        break;

      case 'coin':
        this.tone({ freq: 1046, dur: 0.08, type: 'square', gain: 0.055, filter: 6000 });
        this.tone({ freq: 1568, dur: 0.18, type: 'square', gain: 0.05, at: 0.07, filter: 7000 });
        break;

      case 'star':
        [880, 1174, 1568].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.12, at: i * 0.11, attack: 0.01 })
        );
        break;

      case 'win': {
        const seq = [523, 659, 784, 1047, 1319];
        seq.forEach((f, i) => {
          this.tone({ freq: f, dur: 0.42, type: 'triangle', gain: 0.12, at: i * 0.085 });
          this.tone({ freq: f * 2, dur: 0.3, type: 'sine', gain: 0.045, at: i * 0.085 + 0.01 });
        });
        this.noise({ dur: 0.5, gain: 0.05, type: 'highpass', freq: 3000, to: 9000, at: 0.1 });
        break;
      }

      case 'lose': {
        [392, 330, 262].forEach((f, i) =>
          this.tone({ freq: f, to: f * 0.94, dur: 0.5, type: 'sawtooth', gain: 0.1, at: i * 0.13, filter: 1200 })
        );
        this.tone({ freq: 120, to: 60, dur: 0.8, type: 'sine', gain: 0.12, at: 0.2 });
        break;
      }

      case 'hint':
        this.tone({ freq: 1318, dur: 0.12, type: 'sine', gain: 0.09 });
        this.tone({ freq: 1760, dur: 0.22, type: 'sine', gain: 0.07, at: 0.09 });
        break;

      case 'undo':
        this.tone({ freq: 700, to: 420, dur: 0.16, type: 'triangle', gain: 0.09 });
        break;

      case 'shuffle':
        this.noise({ dur: 0.34, gain: 0.08, type: 'bandpass', freq: 600, to: 4000, q: 0.8 });
        this.tone({ freq: 220, to: 660, dur: 0.3, type: 'triangle', gain: 0.07 });
        break;

      case 'achieve':
        [659, 880, 1047, 1319].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.34, type: 'sine', gain: 0.1, at: i * 0.08 })
        );
        break;

      case 'levelup':
        this.tone({ freq: 523, to: 1047, dur: 0.4, type: 'triangle', gain: 0.11 });
        break;

      default:
        break;
    }
  }

  /* ---------------- music ---------------- */

  setMusicEnabled(on) {
    if (!this.ctx) {
      if (!on) return;
      this.ensure();
    }
    if (!this.ctx) return;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(this.t);
    g.setTargetAtTime(on ? 0.2 : 0, this.t, 0.25);
    if (on && !this.musicPlaying) this.startMusic();
    if (!on) this.musicPlaying = false;
  }

  setSfxEnabled(on) {
    if (!this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(on ? 0.85 : 0, this.t, 0.05);
  }

  startMusic() {
    if (!store.settings.music) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = setInterval(() => this._tick(), 60);
    this.musicGain.gain.setTargetAtTime(0.2, ctx.currentTime, 0.4);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  _tick() {
    if (!this.musicPlaying || !this.ctx) return;
    const ctx = this.ctx;
    const stepDur = 60 / 80 / 2; // 80bpm, eighth notes
    if (this.nextTime < ctx.currentTime - 0.6) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.2) {
      this._scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  _scheduleStep(step, time, stepDur) {
    const ctx = this.ctx;
    const bar = Math.floor(step / 8) % 4;
    const roots = [45, 41, 48, 43]; // A minor, F, C, G
    const root = roots[bar];
    const local = step % 8;
    const out = this.musicGain;

    const osc = (freq, type, gain, dur, at, filter) => {
      const t0 = time + at;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.5, dur * 0.35));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = o;
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        f.Q.value = 0.7;
        o.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    };

    if (local === 0) {
      const chordDur = stepDur * 8.2;
      osc(midi(root), 'sine', 0.1, chordDur, 0, 900);
      osc(midi(root + 7), 'sine', 0.062, chordDur, 0.02, 900);
      osc(midi(root + 15), 'triangle', 0.03, chordDur, 0.05, 1400);
    }

    if (local === 0 || local === 4) {
      execBass(ctx, time, midi(root - 12), local === 0 ? 0.5 : 0.3);
    }

    const pent = [0, 3, 7, 10, 12, 15];
    if ([0, 2, 3, 5, 6, 7].includes(local)) {
      const idx = (local + bar * 2) % pent.length;
      const f = midi(root + 24 + pent[idx]);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = time;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.028, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) p.pan.value = local % 2 ? 0.28 : -0.28;
      o.connect(g);
      if (p) {
        g.connect(p);
        p.connect(out);
      } else g.connect(out);
      o.start(t0);
      o.stop(t0 + 0.4);
    }

    if (local === 2 || local === 6) {
      // soft hat
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.012, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(time);
      src.stop(time + 0.1);
    }

    function execBass(c, t0, freq, dur) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.075, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      o.connect(f);
      f.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }
}

export const audio = new AudioEngine();
