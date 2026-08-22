/**
 * Speaker recognition — TRANSPARENT, LOCAL-ONLY acoustic voiceprint.
 *
 * Honesty note (shown in the UI too): browsers do not expose a biometric
 * speaker-embedding API. This module extracts a classical acoustic feature
 * vector (pitch, spectral centroid, energy profile, zero-crossing rate) from
 * a locally recorded sample. It can distinguish clearly different voices; it
 * is NOT a security-grade biometric. It never leaves the device.
 *
 * The Android implementation uses the same pipeline on raw PCM from AudioRecord.
 */
import { State, emit } from './state.js';
import { recordSample } from './audio-synth.js';

const KEY = 'jarvis.voiceprint.v1';

let profiles = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(profiles)); } catch {} }

/* ── feature extraction (pure, synchronous on Float32Array) ──────────────── */
export function extractFeatures(samples, sampleRate = 44100) {
  if (!samples || samples.length < sampleRate / 2) return null;

  // RMS energy profile (10 buckets)
  const buckets = 10;
  const energy = new Array(buckets).fill(0);
  const per = Math.floor(samples.length / buckets);
  for (let b = 0; b < buckets; b++) {
    let sum = 0;
    for (let i = b * per; i < (b + 1) * per; i++) sum += samples[i] * samples[i];
    energy[b] = Math.sqrt(sum / per);
  }
  const emax = Math.max(...energy) || 1e-9;
  const energyNorm = energy.map(e => e / emax);

  // zero-crossing rate
  let zcr = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) zcr++;
  }
  const zcrNorm = Math.min(1, zcr / samples.length * 400);

  // spectral centroid via simple FFT-less approximation on windowed frames
  const frame = 2048;
  const centroids = [];
  for (let off = 0; off + frame <= samples.length; off += frame) {
    let num = 0, den = 0, prev = samples[off];
    for (let i = 1; i < frame; i++) {
      const d = samples[off + i] - prev;
      num += d * d * i; den += d * d; prev = samples[off + i];
    }
    if (den > 1e-9) centroids.push(num / den / frame);
  }
  const centroid = centroids.length ? centroids.reduce((a, b) => a + b, 0) / centroids.length : 0;

  // fundamental pitch via autocorrelation (rough, robust)
  let pitch = 0;
  const seg = samples.subarray(Math.floor(samples.length * 0.2), Math.floor(samples.length * 0.7));
  const minLag = Math.floor(sampleRate / 400), maxLag = Math.floor(sampleRate / 60);
  if (seg.length > maxLag * 2) {
    let best = -1, bestLag = 0;
    for (let lag = minLag; lag < maxLag; lag++) {
      let c = 0;
      for (let i = 0; i < seg.length - lag; i += 8) c += seg[i] * seg[i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    if (best > 0) pitch = sampleRate / bestLag;
  }
  const pitchNorm = Math.min(1, Math.max(0, (Math.log2(pitch + 1) - 6) / 3));

  return { energy: energyNorm, zcr: zcrNorm, centroid, pitch: pitchNorm };
}

function similarity(a, b) {
  if (!a || !b) return 0;
  let e = 0;
  for (let i = 0; i < a.energy.length; i++) e += (a.energy[i] - b.energy[i]) ** 2;
  const energySim = Math.max(0, 1 - Math.sqrt(e / a.energy.length));
  const zcrSim = Math.max(0, 1 - Math.abs(a.zcr - b.zcr));
  const centSim = Math.max(0, 1 - Math.abs(a.centroid - b.centroid) * 4);
  const pitchSim = Math.max(0, 1 - Math.abs(a.pitch - b.pitch) * 2);
  return Math.round((0.45 * energySim + 0.2 * zcrSim + 0.2 * centSim + 0.15 * pitchSim) * 100);
}

/* ── profile management ───────────────────────────────────────────────────── */
export const SpeakerId = {
  profiles: () => profiles.map(p => ({ name: p.name, createdAt: p.createdAt, sampleCount: p.samples.length })),

  async enroll(name, samplesPerTry = 2) {
    const samples = [];
    for (let i = 0; i < samplesPerTry; i++) {
      emit('enroll-progress', { step: i + 1, total: samplesPerTry });
      const raw = await recordSample(3200);
      const f = extractFeatures(raw);
      if (f) samples.push(f);
    }
    if (!samples.length) throw new Error('Could not extract a voice profile from the recording. Speak clearly and try again.');
    profiles = profiles.filter(p => p.name !== name);
    profiles.push({ name, createdAt: Date.now(), samples });
    persist();
    State.log(`Voice profile enrolled: ${name}`, 'BIO');
    emit('speaker-updated');
    return { name, sampleCount: samples.length };
  },

  /** Live verification → {status, match?, score?} */
  async verify() {
    try {
      const raw = await recordSample(3200);
      const f = extractFeatures(raw);
      if (!f) return { status: 'enrolled', match: null };
      let best = null;
      for (const p of profiles) {
        for (const s of p.samples) {
          const sim = similarity(f, s);
          if (!best || sim > best.score) best = { name: p.name, score: sim };
        }
      }
      if (!best) return { status: profiles.length ? 'enrolled' : 'none', match: null };
      if (best.score >= 70) return { status: 'enrolled', match: best };
      return { status: 'enrolled', match: { ...best, lowConfidence: true } };
    } catch {
      return { status: 'error', match: null };
    }
  },

  remove(name) {
    profiles = profiles.filter(p => p.name !== name);
    persist();
    emit('speaker-updated');
    State.log(`Voice profile deleted: ${name}`, 'BIO');
  },

  wipe() { profiles = []; persist(); emit('speaker-updated'); },
};
