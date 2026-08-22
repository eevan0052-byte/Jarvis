/** Central state store + pub/sub bus. Lightweight and synchronous by design. */
const store = {
  /** Core assistant state machine: BOOTING|IDLE|LISTENING|THINKING|SPEAKING|VISION|PROCESSING|ALERT */
  mode: 'BOOTING',
  prevMode: 'BOOTING',
  modeSetAt: Date.now(),

  boot: { step: 0, checks: [], done: false, skipped: false },
  onboarding: { active: false, step: 0 },

  formFactor: 'open',        // 'cover' | 'open' | 'ambient'
  folded: false,

  voice: { available: false, listening: false, wakeWord: false, speaking: false, level: 0, interim: '', final: '' },
  vision: {
    active: false, cameraOn: false, modelReady: false, modelLoading: false,
    ocrBusy: false, detections: [], faces: [], textLines: [], scene: null, lastError: null,
  },
  net: { online: navigator.onLine, type: null },
  battery: null,             // {level, charging, chargingTime, dischargingTime}
  weather: null,             // {current, forecast, source, ts}
  location: null,            // {lat, lon, label}
  device: {},                // real metrics snapshot
  context: {},               // last computed context object
  memory: { count: 0, version: 1 },
  provider: { id: 'local', label: 'Local NLU' },
  focusMode: false,
  speech: { enabled: true },
  panel: null,               // currently open panel id
  lastIntent: null,
  lastResponse: null,
  systemLog: [],             // ring buffer of recent system events (for HUD streams)
};

const listeners = new Map();

export const State = {
  get: (k) => store[k],
  set(k, v) { store[k] = v; emit(k, v); },
  patch(p) { Object.assign(store, p); Object.keys(p).forEach(k => emit(k, store[k])); },
  /** Set assistant mode + notify. */
  setMode(mode, detail = {}) {
    if (store.mode === mode) return;
    store.prevMode = store.mode;
    store.mode = mode;
    store.modeSetAt = Date.now();
    emit('mode', { mode, prev: store.prevMode, ...detail });
  },
  log(msg, tag = 'SYS') {
    store.systemLog.push({ t: Date.now(), tag, msg });
    if (store.systemLog.length > 120) store.systemLog.shift();
    emit('syslog', store.systemLog);
  },
};

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (set) [...set].forEach(fn => { try { fn(payload); } catch (e) { console.error('[bus]', evt, e); } });
}
/** Subscribe once. */
export function once(evt, fn) {
  const off = on(evt, (p) => { off(); fn(p); });
  return off;
}
