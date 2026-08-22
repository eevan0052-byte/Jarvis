/** Smart Briefing — time, weather, battery, reminders, routines, notices. */
import { $ } from './../utils.js';
import { State } from './../state.js';
import { greeting, fmtDate, fmtTime } from './../utils.js';
import { weatherDesc } from './../providers/local.js';
import { listReminders } from './../reminders.js';
import { listRules } from './../automation.js';
import { Memory } from './../memory.js';
import { Settings } from './../settings.js';

export function renderBriefing() {
  const d = new Date();
  const b = State.get('battery');
  const w = State.get('weather');
  const net = State.get('net');
  const reminders = listReminders();
  const routines = listRules().filter(r => r.enabled);
  const name = Settings.get('user.name');
  const unit = Settings.get('units') === 'imperial' ? 'F' : 'C';
  const t = (c) => Settings.get('units') === 'imperial' ? Math.round(c * 9 / 5 + 32) : Math.round(c);

  $('#briefing-date').textContent = fmtDate(d) + ' · ' + fmtTime(d);

  const cards = [
    { ico: '◷', t: 'Time', v: `${greeting(d)}${name ? ', ' + name.split(' ')[0] : ''}.`, s: fmtDate(d) + ' — ' + fmtTime(d) },
    w ? { ico: '☁', t: `Weather · ${w.city}${w.stale ? ' (cached)' : ''}`, v: `${t(w.current.temp)}°${unit} — ${weatherDesc(w.current.condition)}`, s: `Feels ${t(w.current.feels)}°${unit} · wind ${w.current.wind} km/h · humidity ${w.current.humidity}%` } : { ico: '☁', t: 'Weather', v: 'Not configured', s: 'Set a city or grant location in Settings → Environment.' },
    b ? { ico: '▮', t: 'Power', v: `${Math.round(b.level * 100)}% ${b.charging ? '· charging' : ''}`, s: !b.charging && b.level <= 0.25 ? 'Low — consider charging soon.' : 'Battery level nominal.' } : { ico: '▮', t: 'Power', v: 'Unavailable', s: 'Battery API not exposed in this environment.' },
    { ico: '◈', t: 'Reminders', v: reminders.length ? `${reminders.length} pending` : 'None pending', s: reminders.length ? reminders.slice(0, 3).map(r => `${r.body} (${r.dueLabel})`).join(' · ') : 'Say "remind me to …" to create one.' },
    { ico: '⚙', t: 'Routines', v: routines.length ? `${routines.length} armed` : 'None armed', s: routines.length ? routines.map(r => r.name).join(' · ') : 'Create one in Automation.' },
    { ico: '⌁', t: 'Network', v: net.online ? 'Online' : 'Offline', s: net.online ? (net.type ? `Link type: ${net.type}` : 'Connected.') : 'Offline Intelligence Mode active — local capabilities remain.' },
    { ico: '∿', t: 'Memory', v: `${Memory.all().length} entries`, s: `${Memory.all('fact').length} facts · ${Memory.all('object').length} objects · ${Memory.all('routine').length} routines` },
    { ico: '◉', t: 'Focus', v: State.get('focusMode') ? 'Active' : 'Inactive', s: State.get('focusMode') ? 'Alerts suppressed while active.' : 'Say "start focus mode" for deep work.' },
  ];

  $('#briefing-body').innerHTML = cards.map(c => `
    <div class="brief-card">
      <div class="ico">${c.ico}</div>
      <div style="flex:1">
        <div class="t">${c.t}</div>
        <div class="v">${c.v}</div>
        <div class="s">${c.s}</div>
      </div>
    </div>`).join('');
}
