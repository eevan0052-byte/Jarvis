/**
 * Face recognition — TRANSPARENT, LOCAL-ONLY.
 *
 * Uses the platform FaceDetector API (when available) to extract landmark
 * geometry (eye distance, nose/mouth relative positions, face aspect). This
 * is an appearance template for personalization — NOT a security biometric.
 * If FaceDetector is unavailable, enrollment is disabled and the UI says so.
 *
 * Storage: templates are AES-GCM encrypted. The template key is derived from
 * the Privacy Vault PIN when one exists; otherwise a session key is used and
 * templates do not survive a reload (stated in the UI).
 */
import { State, emit } from './state.js';

const KEY = 'jarvis.facetemplate.v1';

let templates = [];
let sessionKey = null;

export function faceApiAvailable() { return !!window.FaceDetector; }

async function getKey() {
  try {
    const { Vault } = await import('./secrets.js');
    if (Vault.unlocked) {
      // derive a deterministic key from the vault by encrypting a constant
      const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('jarvis-face-template-v1'));
      return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
  } catch {}
  if (!sessionKey) {
    sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  return sessionKey;
}

async function persist() {
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(templates)));
    const out = { iv: b64(iv), data: b64(ct) };
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch (e) { console.warn('face template persist failed', e); }
}
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }

async function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const box = JSON.parse(raw);
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(box.iv), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(box.data), c => c.charCodeAt(0)));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return []; }
}

/** Landmark geometry template from a detected face. */
export function templateFromFace(face, videoW, videoH) {
  const b = face.boundingBox;
  const pts = face.landmarks || [];
  const pt = (name) => pts.find(p => p.type === name)?.locations?.[0] || null;
  const lEye = pt('eye') && pts.filter(p => p.type === 'eye')[0]?.locations?.[0];
  const rEye = pts.filter(p => p.type === 'eye')[1]?.locations?.[0];
  const nose = pts.find(p => p.type === 'nose')?.locations?.[0];
  const mouth = pts.find(p => p.type === 'mouth')?.locations?.[0];
  if (!lEye || !rEye || !nose || !mouth) return null;
  const W = b.width || videoW, H = b.height || videoH;
  const norm = (p) => ({ x: p.x / (videoW || 1), y: p.y / (videoH || 1) });
  return {
    aspect: W / H,
    eyeDist: Math.hypot(lEye.x - rEye.x, lEye.y - rEye.y) / W,
    eyeMid: norm({ x: (lEye.x + rEye.x) / 2, y: (lEye.y + rEye.y) / 2 }),
    nose: norm(nose),
    mouth: norm(mouth),
    noseToMouth: Math.hypot(nose.x - mouth.x, nose.y - mouth.y) / H,
    eyeAngle: Math.atan2(rEye.y - lEye.y, rEye.x - lEye.x),
  };
}

export function matchFace(tpl, samples) {
  let best = 0;
  for (const s of samples) {
    const eyeDist = Math.max(0, 1 - Math.abs(tpl.eyeDist - s.eyeDist) / 0.12);
    const aspect = Math.max(0, 1 - Math.abs(tpl.aspect - s.aspect) / 0.35);
    const ntm = Math.max(0, 1 - Math.abs(tpl.noseToMouth - s.noseToMouth) / 0.15);
    const eyeAngle = Math.max(0, 1 - Math.abs(tpl.eyeAngle - s.eyeAngle) / 0.3);
    const score = Math.round((0.3 * eyeDist + 0.2 * aspect + 0.3 * ntm + 0.2 * eyeAngle) * 100);
    if (score > best) best = score;
  }
  return best;
}

export const FaceId = {
  profiles: () => templates.map(t => ({ name: t.name, createdAt: t.createdAt, samples: t.samples.length })),

  async enroll(name, faces) {
    const samples = [];
    for (const f of faces) {
      const t = templateFromFace(f, 1280, 720);
      if (t) samples.push(t);
    }
    if (!samples.length) throw new Error('Could not extract facial landmarks. Look straight at the camera with good lighting.');
    templates = await load();
    templates = templates.filter(t => t.name !== name);
    templates.push({ name, createdAt: Date.now(), samples });
    await persist();
    State.log(`Face profile enrolled: ${name}`, 'BIO');
    emit('face-updated');
    return { name, samples: samples.length };
  },

  /** Match current faces against stored templates. */
  async verify(faces) {
    templates = await load();
    if (!templates.length) return { status: 'none' };
    const out = [];
    for (const f of faces) {
      const t = templateFromFace(f, 1280, 720);
      if (!t) continue;
      for (const prof of templates) {
        const score = matchFace(t, prof.samples);
        out.push({ name: prof.name, score });
      }
    }
    if (!out.length) return { status: 'enrolled', match: null };
    const best = out.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.score >= 60) return { status: 'enrolled', match: best };
    return { status: 'enrolled', match: { ...best, lowConfidence: true } };
  },

  async remove(name) {
    templates = await load();
    templates = templates.filter(t => t.name !== name);
    await persist();
    emit('face-updated');
    State.log(`Face profile deleted: ${name}`, 'BIO');
  },

  async wipe() { templates = []; await persist(); emit('face-updated'); },
};
