/**
 * Adaptive Personal Memory.
 * Persistent, categorized, searchable, editable, deletable. Includes usage
 * statistics the Context Engine mines for predictive assistance. Everything
 * is stored locally; nothing leaves the device without an explicit export.
 */
import { uid } from './utils.js';
import { emit, State } from './state.js';

const KEY = 'jarvis.memory.v2';
export const CATEGORIES = [
  { id: 'fact', label: 'Facts', icon: '◈' },
  { id: 'preference', label: 'Preferences', icon: '✦' },
  { id: 'reminder', label: 'Reminders', icon: '◷' },
  { id: 'routine', label: 'Routines', icon: '⚙' },
  { id: 'object', label: 'Object Memory', icon: '▣' },
  { id: 'device', label: 'Named Devices', icon: '⌁' },
  { id: 'command', label: 'Custom Commands', icon: '⌘' },
  { id: 'mission', label: 'Missions', icon: '◉' },
  { id: 'note', label: 'Notes', icon: '≡' },
  { id: 'observation', label: 'Usage Stats', icon: '∿' },
];

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 2, entries: [], stats: { intents: {}, hours: {}, days: {} } };
    const parsed = JSON.parse(raw);
    if (!parsed.entries) parsed.entries = [];
    if (!parsed.stats) parsed.stats = { intents: {}, hours: {}, days: {} };
    return parsed;
  } catch { return { version: 2, entries: [], stats: {} }; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('memory persist failed', e); }
  State.patch({ memory: { count: db.entries.length, version: db.version } });
  emit('memory', db);
}

export const Memory = {
  all(category) {
    let list = [...db.entries].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    if (category) list = list.filter(e => e.category === category);
    return list;
  },

  get(id) { return db.entries.find(e => e.id === id); },

  add({ category = 'note', title, body = '', tags = [], privateFlag = false, data = null, pinned = false }) {
    const entry = {
      id: uid('mem'), category, title: title || body.slice(0, 48) || 'Untitled',
      body, tags, privateFlag, data, pinned,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    db.entries.push(entry);
    persist();
    emit('memory:add', entry);
    return entry;
  },

  update(id, patch) {
    const e = this.get(id);
    if (!e) return null;
    Object.assign(e, patch, { updatedAt: Date.now() });
    persist();
    emit('memory:update', e);
    return e;
  },

  remove(id) {
    db.entries = db.entries.filter(e => e.id !== id);
    persist();
    emit('memory:remove', id);
  },

  removeAll(category) {
    db.entries = category ? db.entries.filter(e => e.category !== category) : [];
    persist();
    emit('memory:wipe');
  },

  /** Keyword search across title/body/tags, scored. */
  search(query, limit = 8) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/);
    const scored = db.entries.map(e => {
      const hay = `${e.title} ${e.body} ${(e.tags || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 2;
        if (e.title.toLowerCase().includes(t)) score += 3;
        if ((e.tags || []).some(tag => tag.toLowerCase().includes(t))) score += 2;
      }
      return { e, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(x => x.e);
  },

  /** Memories the context engine considers relevant to a query. */
  relevant(query, limit = 5) { return this.search(query, limit); },

  forgetMatching(query) {
    const hits = this.search(query, 20);
    hits.forEach(h => this.remove(h.id));
    return hits.length;
  },

  // ── usage statistics (predictive assistance data) ─────────────────────────
  recordIntent(intent) {
    const s = db.stats;
    s.intents[intent] = (s.intents[intent] || 0) + 1;
    const h = new Date().getHours();
    s.hours[h] = (s.hours[h] || 0) + 1;
    const day = new Date().toDateString();
    s.days[day] = (s.days[day] || 0) + 1;
    persist();
  },

  /** Top activity hour (for "you usually do X around now" predictions). */
  topHours(n = 3) {
    return Object.entries(db.stats.hours || {}).map(([h, c]) => ({ hour: +h, count: c })).sort((a, b) => b.count - a.count).slice(0, n);
  },

  topIntents(n = 5) {
    return Object.entries(db.stats.intents || {}).map(([i, c]) => ({ intent: i, count: c })).sort((a, b) => b.count - a.count).slice(0, n);
  },

  exportJson() { return JSON.stringify(db, null, 2); },

  importJson(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.entries)) throw new Error('Invalid memory file');
    db = { version: 2, entries: parsed.entries, stats: parsed.stats || { intents: {}, hours: {}, days: {} } };
    persist();
  },

  wipe() { db = { version: 2, entries: [], stats: { intents: {}, hours: {}, days: {} } }; persist(); },

  stats() { return db.stats; },
};
