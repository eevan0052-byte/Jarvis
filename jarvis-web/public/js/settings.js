/** Persistent user settings (localStorage), with schema versioning and migration. */
import { State, emit } from './state.js';

const KEY = 'jarvis.settings.v3';
const DEFAULTS = {
  version: 3,
  assistant: { name: 'JARVIS' },
  user: { name: '', style: 'balanced' },            // style: brief | balanced | verbose
  voice: {
    ttsEnabled: true, ttsRate: 1.02, ttsPitch: 0.9, voiceURI: '', volume: 0.85,
    wakeWord: false, pushToTalk: true, autoListen: false,
  },
  sounds: { enabled: true, volume: 0.55 },
  vision: { boxes: true, labels: true, confidence: 0.30, scanFx: true, gestures: false, maxFps: 10 },
  formFactor: 'auto',                                // auto | cover | open | ambient
  provider: { id: 'local' },
  providers: {
    openai: { label: 'OpenAI-compatible', enabled: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keySet: false, mode: 'direct' },
    anthropic: { label: 'Anthropic', enabled: false, baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', keySet: false, mode: 'direct' },
    gemini: { label: 'Google Gemini', enabled: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash', keySet: false, mode: 'direct' },
  },
  privacy: { speakerId: true, faceId: true, auditLog: true, storeImages: false },
  a11y: { reducedMotion: false, fontScale: 1, highContrast: false, haptics: true, voiceOnly: false },
  fxQuality: 'auto',                                 // auto | high | medium | low
  units: 'metric',
  weather: { city: '', lat: null, lon: null, source: 'none' },
  onboarding: { done: false },
};

let cache = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    // deep merge over defaults (keeps new fields across versions)
    return deepMerge(structuredClone(DEFAULTS), parsed);
  } catch { return structuredClone(DEFAULTS); }
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object') return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

export const Settings = {
  all: () => cache,
  get: (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), cache),
  set(path, value) {
    const keys = path.split('.');
    let o = cache;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    persist();
    emit('settings', { path, value });
  },
  save() { persist(); },
  reset() {
    cache = structuredClone(DEFAULTS);
    persist();
    emit('settings:reset');
  },
};

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { console.warn('settings persist failed', e); }
}

/** Apply settings-driven document classes (a11y). */
export function applyA11yClasses() {
  const a = cache.a11y;
  const cls = document.documentElement.classList;
  cls.toggle('reduced-motion', !!a.reducedMotion);
  cls.toggle('high-contrast', !!a.highContrast);
  document.documentElement.style.setProperty('--font-scale', String(a.fontScale));
  State.patch({ speech: { ...State.get('speech'), enabled: cache.voice.ttsEnabled } });
}
