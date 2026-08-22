/**
 * Sound design — every sound is synthesized with WebAudio at runtime.
 * No audio files, no copyrighted material. Subtle, layered, configurable.
 * Also provides the microphone VAD meter used for live voice waveforms.
 */
import { Settings } from './settings.js';
import { State, emit } from './state.js';

let ctx = null;
let master = null;
let micStream = null;
let micAnalyser = null;
let vadCallback = null;
let vadRaf = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function env(gain, t0, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone({ freq, freqEnd, type = 'sine', t0 = 0, dur = 0.3, vol = 0.5, attack = 0.01, curve = 'exp' }) {
  const c = ensureCtx();
  const t = c.currentTime + t0;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency[`${curve === 'lin' ? 'linear' : 'exponential'}RampToValueAtTime`](freqEnd, t + dur);
  env(g, t, attack, vol, dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.1, freq = 4000, t0 = 0, type = 'highpass' }) {
  const c = ensureCtx();
  const t = c.currentTime + t0;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const vol = () => Settings.get('sounds.volume') ?? 0.55;

export const SFX = {
  boot() {
    ensureCtx();
    tone({ freq: 120, freqEnd: 240, dur: 0.9, type: 'sine', vol: 0.35 * vol() });
    tone({ freq: 360, freqEnd: 720, dur: 0.7, type: 'sine', vol: 0.18 * vol(), t0: 0.25 });
    tone({ freq: 540, freqEnd: 1080, dur: 0.5, type: 'sine', vol: 0.12 * vol(), t0: 0.55 });
    noise({ dur: 0.7, vol: 0.05 * vol(), freq: 6000, t0: 0.05 });
  },
  online() {
    tone({ freq: 523, dur: 0.4, type: 'sine', vol: 0.3 * vol() });
    tone({ freq: 784, dur: 0.5, type: 'sine', vol: 0.22 * vol(), t0: 0.12 });
    tone({ freq: 1046, dur: 0.7, type: 'sine', vol: 0.14 * vol(), t0: 0.24 });
  },
  listenStart() {
    tone({ freq: 880, dur: 0.09, type: 'sine', vol: 0.22 * vol() });
    tone({ freq: 1320, dur: 0.12, type: 'sine', vol: 0.12 * vol(), t0: 0.07 });
  },
  listenEnd() {
    tone({ freq: 1320, dur: 0.08, type: 'sine', vol: 0.18 * vol() });
    tone({ freq: 880, dur: 0.1, type: 'sine', vol: 0.1 * vol(), t0: 0.06 });
  },
  recognized() {
    tone({ freq: 660, dur: 0.1, type: 'sine', vol: 0.2 * vol() });
    tone({ freq: 990, dur: 0.14, type: 'sine', vol: 0.14 * vol(), t0: 0.08 });
  },
  processing() {
    tone({ freq: 440, freqEnd: 445, dur: 0.3, type: 'triangle', vol: 0.08 * vol() });
    tone({ freq: 441, freqEnd: 446, dur: 0.3, type: 'triangle', vol: 0.06 * vol(), t0: 0.05 });
  },
  confirm() {
    tone({ freq: 587, dur: 0.12, type: 'sine', vol: 0.22 * vol() });
    tone({ freq: 880, dur: 0.2, type: 'sine', vol: 0.16 * vol(), t0: 0.1 });
  },
  alert() {
    tone({ freq: 392, dur: 0.16, type: 'sine', vol: 0.22 * vol() });
    tone({ freq: 311, dur: 0.22, type: 'sine', vol: 0.22 * vol(), t0: 0.16 });
    tone({ freq: 392, dur: 0.3, type: 'sine', vol: 0.16 * vol(), t0: 0.34 });
  },
  error() {
    tone({ freq: 220, freqEnd: 180, dur: 0.25, type: 'square', vol: 0.07 * vol() });
    tone({ freq: 165, freqEnd: 140, dur: 0.3, type: 'square', vol: 0.07 * vol(), t0: 0.22 });
  },
  scan() {
    tone({ freq: 500, freqEnd: 2400, dur: 0.5, type: 'sawtooth', vol: 0.05 * vol(), curve: 'lin' });
    noise({ dur: 0.4, vol: 0.03 * vol(), freq: 3000 });
  },
  scanComplete() {
    tone({ freq: 1200, dur: 0.1, type: 'sine', vol: 0.16 * vol() });
    tone({ freq: 1600, dur: 0.16, type: 'sine', vol: 0.12 * vol(), t0: 0.09 });
  },
  notify() {
    tone({ freq: 740, dur: 0.1, type: 'sine', vol: 0.14 * vol() });
    tone({ freq: 988, dur: 0.16, type: 'sine', vol: 0.12 * vol(), t0: 0.08 });
  },
  wake() {
    tone({ freq: 300, freqEnd: 1200, dur: 0.28, type: 'sine', vol: 0.24 * vol(), curve: 'lin' });
    tone({ freq: 600, freqEnd: 1800, dur: 0.34, type: 'sine', vol: 0.14 * vol(), t0: 0.1, curve: 'lin' });
  },
  keyTick() {
    tone({ freq: 1400, dur: 0.03, type: 'sine', vol: 0.08 * vol() });
  },
};

/** Wrap SFX with the sounds-enabled gate. */
export function play(name) {
  if (!Settings.get('sounds.enabled')) return;
  try { SFX[name]?.(); } catch (e) { console.warn('sfx', e); }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Voice Activity Detection — real-time mic level (0..1).                     */
/* Mic is only captured while explicitly requested (listening / enrollment). */
/* ────────────────────────────────────────────────────────────────────────── */
export async function startVAD(cb) {
  try {
    if (!micStream) micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const c = ensureCtx();
    if (!micAnalyser) {
      const src = c.createMediaStreamSource(micStream);
      micAnalyser = c.createAnalyser();
      micAnalyser.fftSize = 1024;
      micAnalyser.smoothingTimeConstant = 0.55;
      src.connect(micAnalyser);
    }
    vadCallback = cb;
    const data = new Uint8Array(micAnalyser.fftSize);
    const tick = () => {
      if (!vadCallback) return;
      micAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 6);
      vadCallback(level);
      vadRaf = requestAnimationFrame(tick);
    };
    tick();
    return true;
  } catch {
    return false; // mic denied or busy — caller handles gracefully
  }
}

export function stopVAD() {
  vadCallback = null;
  if (vadRaf) { cancelAnimationFrame(vadRaf); vadRaf = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; micAnalyser = null; }
}

/** Raw sample capture for speaker enrollment (returns Float32Array samples). */
export async function recordSample(ms = 3200) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const c = ensureCtx();
  const src = c.createMediaStreamSource(stream);
  const proc = c.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  await new Promise(r => setTimeout(r, ms));
  proc.disconnect();
  stream.getTracks().forEach(t => t.stop());
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const ch of chunks) { all.set(ch, off); off += ch.length; }
  return all;
}
