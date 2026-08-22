/**
 * Neural Context Engine — the central intelligence layer.
 * Fuses user / device / environment / conversational context into a single
 * Context object consumed by providers, predictions and the HUD. It also
 * produces Predictive Assistance candidates from observed behavior.
 */
import { State, emit } from './state.js';
import { Memory } from './memory.js';
import { Settings } from './settings.js';

const history = []; // last N conversation turns (this session)
const MAX_HISTORY = 24;

export function pushConversation(turn) {
  history.push(turn);
  if (history.length > MAX_HISTORY) history.shift();
}

export function conversationHistory() { return [...history]; }

export function buildContext(extra = {}) {
  const s = Settings.all();
  const device = State.get('device') || {};
  const net = State.get('net');
  const weather = State.get('weather');
  const vision = State.get('vision');
  const reminders = Memory.all('reminder');
  const routines = Memory.all('routine');

  const ctx = {
    online: net.online,
    providerCloudReady: s.provider.id !== 'local' && net.online,
    units: s.units,
    focusMode: State.get('focusMode'),
    user: { name: s.user?.name || '', style: s.user?.style || 'balanced' },
    assistant: { name: s.assistant?.name || 'JARVIS' },
    device: {
      battery: device.battery || State.get('battery') || null,
      net: { online: net.online, type: net.type, downlink: device.downlink },
      storage: device.storage || null,
      ram: device.ram ?? null,
      formFactor: State.get('formFactor'),
      charging: (device.battery || {}).charging || false,
    },
    environment: {
      time: new Date(),
      weather: weather ? { ...weather, current: weather.current } : null,
      location: State.get('location'),
      camera: vision.active ? {
        detections: vision.detections || [],
        faces: vision.faces || [],
        text: vision.textLines?.join('\n') || null,
        scene: vision.scene || null,
      } : null,
      speaker: State.get('speakerStatus') || null,
    },
    memory: {
      count: dbCount(),
      relevant: extra.query ? Memory.relevant(extra.query, 5) : [],
    },
    reminders: reminders.map(r => ({ body: r.title, due: r.dueAt, dueLabel: r.dueLabel, id: r.id })),
    routines: routines.map(r => ({ name: r.title, when: r.data?.when || null, id: r.id })),
    customCommands: Memory.all('command').map(c => ({ name: c.title, actions: c.data?.actions || [], aliases: c.tags || [], id: c.id })),
    history: history.slice(-6),
  };
  State.patch({ context: ctx });
  return ctx;
}

function dbCount() { return State.get('memory').count; }

/* ────────────────────────────────────────────────────────────────────────── */
/* Predictive assistance — pure function of context; never executed silently. */
/* ────────────────────────────────────────────────────────────────────────── */
export function predict(ctx) {
  const out = [];
  const now = new Date();
  const b = ctx.device.battery;
  const dev = State.get('device') || {};

  // battery
  if (b && !b.charging && b.level <= 0.2) {
    out.push({ id: 'batt', kind: 'suggest', priority: 2, icon: '▮', title: `Battery at ${Math.round(b.level * 100)}%`, body: 'Enable Battery Saver? I will reduce rendering load and defer background work.', action: 'battery_saver' });
  }
  // charging complete-ish
  if (b && b.charging && b.level >= 0.98) {
    out.push({ id: 'full', kind: 'notice', priority: 0, icon: '⚡', title: 'Charge complete', body: 'Battery is effectively full. You can unplug to preserve battery health.', action: null });
  }
  // offline
  if (!ctx.online) {
    out.push({ id: 'offline', kind: 'notice', priority: 1, icon: '⇊', title: 'Offline Intelligence Mode', body: 'Cloud AI unavailable. Local voice, vision and memory remain active.', action: null });
  }
  // routine hour pattern ("you usually start X around this time")
  const top = Memory.topHours(3);
  const hour = now.getHours();
  if (top.some(t => t.hour === hour && t.count >= 3) && !ctx.focusMode && !dev._focusSuggestionAt) {
    out.push({ id: 'habit', kind: 'suggest', priority: 1, icon: '∿', title: 'Usual activity time', body: 'You are typically active around this hour. Start Focus Mode for deep work?', action: 'focus_start' });
  }
  // upcoming reminder within 10 minutes
  const soon = (ctx.reminders || []).filter(r => r.due && r.due - Date.now() < 10 * 60_000 && r.due - Date.now() > 0);
  if (soon.length) {
    out.push({ id: 'remsoon', kind: 'notice', priority: 1, icon: '◷', title: 'Upcoming reminder', body: `${soon[0].body} (${soon[0].dueLabel})`, action: null });
  }
  // leaving home? (web cannot geofence reliably — only if geolocation granted and moved > threshold is complex; provide manual "home" check)
  const loc = State.get('location');
  if (loc && Settings.get('weather.lat') === null) {
    out.push({ id: 'loc', kind: 'suggest', priority: 0, icon: '◎', title: 'Location available', body: 'Save your current location as your home city for weather and routines?', action: 'save_city' });
  }
  // device RAM pressure
  if (dev.ram != null && dev.ram <= 2) {
    out.push({ id: 'ram', kind: 'notice', priority: 0, icon: '◫', title: 'Low memory device', body: `This device reports ${dev.ram} GB RAM. Visual effects run in reduced mode.`, action: null });
  }
  // no reminders at all
  if (ctx.reminders.length === 0 && Memory.all('observation').length === 0) {
    // onboarding-era nudge only once
    out.push({ id: 'first-rem', kind: 'suggest', priority: 0, icon: '◷', title: 'Reminders ready', body: 'Try saying "remind me to take a break in 25 minutes".', action: null });
  }
  return out;
}

export { history };
