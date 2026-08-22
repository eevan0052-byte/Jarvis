/** System notifications (Notification API) + haptics wrapper. */
import { Settings } from './settings.js';
import { State, emit } from './state.js';

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const res = await Notification.requestPermission();
  emit('perm-changed', { name: 'notifications', state: res });
  return res;
}

export function notify(title, body, tag = 'jarvis') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (State.get('focusMode') && !State.get('focusAllowNotify')) return;
  try {
    new Notification(title, { body, tag, silent: true });
  } catch {}
}

/* ── haptics ──────────────────────────────────────────────────────────────── */
const PATTERNS = {
  listen: [8],
  recognized: [10, 30, 14],
  confirm: [14],
  error: [30, 40, 30],
  scanDone: [12, 30, 12],
};

export function haptic(name) {
  if (!Settings.get('a11y.haptics')) return;
  try { navigator.vibrate?.(PATTERNS[name] || [10]); } catch {}
}

export function hapticEnabled() { return Settings.get('a11y.haptics') !== false; }
