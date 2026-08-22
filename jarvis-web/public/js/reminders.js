/** Reminders — scheduled on-device with optional system notifications. */
import { Memory } from './memory.js';
import { parseTimePhrase } from './utils.js';
import { notify } from './notifications.js';
import { State, emit } from './state.js';
import { play } from './audio-synth.js';

let timer = null;
const FIRED = new Set();

export function createReminder(body, timePhrase = '') {
  const dueAt = parseTimePhrase(timePhrase)?.getTime() || Date.now() + 10 * 60_000;
  const entry = Memory.add({
    category: 'reminder',
    title: body,
    body: timePhrase ? `Due: ${timePhrase}` : '',
    data: { dueAt, timePhrase, done: false },
    pinned: false,
  });
  emit('reminder-created', entry);
  schedule();
  return entry;
}

export function listReminders() {
  return Memory.all('reminder')
    .filter(r => !(r.data?.done))
    .map(r => ({ id: r.id, body: r.title, due: r.data?.dueAt || 0, dueLabel: r.data?.timePhrase || fmt(r.data?.dueAt) }))
    .sort((a, b) => a.due - b.due);
}

function fmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function cancelReminder(id) {
  const e = Memory.get(id);
  if (e) { Memory.update(id, { data: { ...e.data, done: true } }); emit('reminder-cancelled', id); }
}

export function cancelMatching(query) {
  const hits = Memory.all('reminder').filter(r => !r.data?.done && r.title.toLowerCase().includes((query || '').toLowerCase()));
  hits.forEach(h => cancelReminder(h.id));
  return hits.length;
}

export function checkDue() {
  const now = Date.now();
  let fired = false;
  for (const r of Memory.all('reminder')) {
    if (r.data?.done) continue;
    if (r.data?.dueAt && r.data.dueAt <= now && !FIRED.has(r.id)) {
      FIRED.add(r.id);
      Memory.update(r.id, { data: { ...r.data, done: true } });
      play('notify');
      emit('notice', { title: 'Reminder', body: r.title, icon: '◷', kind: 'notice', sticky: true });
      notify('JARVIS reminder', r.title);
      emit('reminder-fired', r);
      fired = true;
    }
  }
  return fired;
}

export function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { checkDue(); emit('reminders-tick'); }, 10000);
}
