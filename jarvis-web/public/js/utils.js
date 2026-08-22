/** Shared utilities: DOM helpers, formatting, misc. No dependencies. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function fmtTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(d = new Date()) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Parse human durations like "30 seconds", "5 minutes", "2 hours", "tomorrow at 9" */
export function parseTimePhrase(phrase, now = new Date()) {
  const p = phrase.toLowerCase();
  const t = new Date(now);
  const num = (m) => { const n = parseFloat(m); return isNaN(n) ? 1 : n; };

  let m = p.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s)\b/); if (m) { t.setSeconds(t.getSeconds() + num(m[1])); return t; }
  m = p.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/); if (m) { t.setMinutes(t.getMinutes() + num(m[1])); return t; }
  m = p.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/); if (m) { t.setHours(t.getHours() + num(m[1])); return t; }

  m = p.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1], 10) % 24;
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    t.setHours(h, min, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t;
  }
  if (/\btomorrow\b/.test(p)) {
    t.setDate(t.getDate() + 1);
    m = p.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (m) {
      let h = parseInt(m[1], 10) % 24;
      const min = m[2] ? parseInt(m[2], 10) : 0;
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      t.setHours(h, min, 0, 0);
    } else t.setHours(9, 0, 0, 0);
    return t;
  }
  if (/\btonight\b/.test(p)) { t.setHours(20, 0, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return t; }
  if (/\bmorning\b/.test(p)) { t.setHours(8, 0, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return t; }
  if (/\bnoon\b/.test(p)) { t.setHours(12, 0, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return t; }
  if (/\bevening\b/.test(p)) { t.setHours(19, 0, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return t; }
  if (/\bin\s+an?\s+hour\b/.test(p)) { t.setHours(t.getHours() + 1); return t; }
  if (/\bin\s+a\s+minute\b/.test(p)) { t.setMinutes(t.getMinutes() + 1); return t; }
  return null;
}

export function truncate(s, n = 140) {
  return s && s.length > n ? s.slice(0, n - 1) + '…' : s || '';
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Escape HTML for safe injection of user content. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Show a transient toast in the notice rail. */
export function toast(msg, kind = 'info', ms = 4200) {
  const holder = $('#toasts') || document.body;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  holder.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
}
