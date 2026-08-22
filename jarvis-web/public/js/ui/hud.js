/** HUD — status chips, rails, modules, syslog, context cards. */
import { State, on } from './../state.js';
import { $, fmtTime, fmtDate, greeting } from './../utils.js';
import { listProviders } from './../providers/index.js';
import { listReminders } from './../reminders.js';
import { weatherDesc } from './../providers/local.js';
import { Settings } from './../settings.js';

let clockTimer = null;

export function initHud() {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);

  on('mode', (m) => { $('#chip-status-txt').textContent = m.mode === 'BOOTING' ? 'ONLINE' : m.mode; $('#chip-status').className = 'chip ' + (m.mode === 'ALERT' ? 'warn' : m.mode === 'IDLE' || m.mode === 'SPEAKING' ? 'ok' : 'ok'); });
  on('device-refresh', renderDevice);
  on('weather', renderWeather);
  on('syslog', renderSyslog);
  on('memory', (m) => { $('#chip-mem-txt').textContent = State.get('memory').count; });
  on('detections', () => renderModules());
  on('mode', () => renderModules());
  on('focus', () => renderFocus());
  on('reminders-tick', renderReminders);
  on('reminder-created', renderReminders);
  on('reminder-cancelled', renderReminders);
  on('provider', renderModules);

  renderModules();
  renderSecurity();
  renderReminders();
  renderStatusLine();
}

function updateClock() {
  const d = new Date();
  $('#p-time').textContent = fmtTime(d);
  $('#p-date').textContent = fmtDate(d);
  $('#ambient-clock').textContent = fmtTime(d);
  $('#ambient-date').textContent = fmtDate(d);
}

function renderDevice() {
  const dev = State.get('device') || {};
  const b = dev.battery;
  const pBatt = $('#p-battery');
  const pBar = $('#p-battery-bar');
  if (b) {
    const pct = Math.round(b.level * 100);
    pBatt.textContent = `${pct}% ${b.charging ? '⚡' : ''}`;
    pBatt.className = 'v ' + (b.charging ? 'ok' : pct <= 20 ? 'err' : pct <= 40 ? 'warn' : '');
    pBar.className = 'bar' + (pct <= 20 ? ' err' : pct <= 40 ? ' warn' : '');
    pBar.querySelector('i').style.width = pct + '%';
  } else {
    pBatt.textContent = 'unavailable';
    pBatt.className = 'v faint';
  }
  const net = dev.net;
  $('#p-net').textContent = net ? (net.online ? (net.type || 'online') : 'offline') : '—';
  $('#p-net').className = 'v ' + (net?.online ? 'ok' : 'err');
  $('#chip-net-txt').textContent = net?.online ? (net.type || 'ONLINE') : 'OFFLINE';
  $('#chip-net').className = 'chip ' + (net?.online ? 'ok' : 'err');
  renderModules();
  renderSecurity();
}

function renderWeather() {
  const w = State.get('weather');
  const el = $('#p-weather');
  const amb = $('#ambient-weather');
  if (w && w.current) {
    const unit = Settings.get('units') === 'imperial' ? 'F' : 'C';
    const t = Settings.get('units') === 'imperial' ? Math.round(w.current.temp * 9 / 5 + 32) : Math.round(w.current.temp);
    el.textContent = `${t}°${unit} ${weatherDesc(w.current.condition).toLowerCase()}${w.stale ? ' (cached)' : ''}`;
    el.className = 'v ' + (w.stale ? 'warn' : 'ok');
    amb.textContent = `${w.city} · ${t}°${unit} · ${weatherDesc(w.current.condition).toLowerCase()}`;
  } else {
    el.textContent = 'not configured';
    el.className = 'v faint';
    amb.textContent = '';
  }
  const loc = State.get('location');
  $('#p-location').textContent = loc?.label || (Settings.get('weather.city') || 'not granted');
}

function renderModules() {
  const vision = State.get('vision');
  const providers = listProviders();
  const active = Settings.get('provider.id') || 'local';
  const rows = [
    { name: 'Voice Engine', st: State.get('voice').available ? 'ONLINE' : 'UNAVAIL', cls: State.get('voice').available ? 'online' : 'off' },
    { name: 'Vision Model', st: vision.modelReady ? (vision.active ? 'ACTIVE' : 'STANDBY') : vision.modelLoading ? 'LOADING' : 'ERROR', cls: vision.modelReady ? (vision.active ? 'busy' : 'online') : vision.modelLoading ? 'busy' : 'off' },
    { name: 'OCR Engine', st: window.Tesseract ? 'READY' : 'MISSING', cls: window.Tesseract ? 'standby' : 'off' },
    { name: 'Face Detect', st: vision.faceApi ? 'AVAILABLE' : 'N/A', cls: vision.faceApi ? 'standby' : 'off' },
    { name: 'AI Engine', st: providers.find(p => p.id === active)?.label || active, cls: active === 'local' ? 'online' : 'busy' },
    { name: 'Memory Index', st: `${State.get('memory').count} ENTRIES`, cls: 'online' },
    { name: 'Automation', st: 'WATCHING', cls: 'online' },
    { name: 'Camera', st: vision.cameraOn ? 'LIVE' : 'OFF', cls: vision.cameraOn ? 'busy' : 'standby' },
    { name: 'Mic (VAD)', st: State.get('voice').listening ? 'CAPTURING' : 'OFF', cls: State.get('voice').listening ? 'busy' : 'standby' },
  ];
  $('#p-modules').innerHTML = rows.map(r =>
    `<div class="module-row"><span class="name">${r.name}</span><span class="st ${r.cls}">${r.st}</span></div>`).join('');
}

function renderSecurity() {
  const vault = (window.__vaultState) || { unlocked: false };
  $('#p-security').innerHTML = `
    <div class="metric-row"><span class="k">Provider keys</span><span class="v ${vault.unlocked ? 'ok' : 'faint'}">${vault.unlocked ? 'VAULT UNLOCKED' : 'ENCRYPTED AT REST'}</span></div>
    <div class="metric-row"><span class="k">Biometrics</span><span class="v ok">LOCAL ONLY</span></div>
    <div class="metric-row"><span class="k">Telemetry</span><span class="v ok">OFF</span></div>`;
}

function renderFocus() {
  $('#p-focus').textContent = State.get('focusMode') ? 'ACTIVE — minimal alerts' : 'Inactive';
  $('#p-focus').className = State.get('focusMode') ? '' : 'faint';
}

function renderReminders() {
  const rs = listReminders();
  $('#p-reminders').innerHTML = rs.length
    ? rs.slice(0, 3).map(r => `<div class="ctx-card" style="border:none;padding:2px 0">◷ ${r.body}<div class="head" style="margin-top:1px">${r.dueLabel || ''}</div></div>`).join('')
    : '<span class="faint">No reminders</span>';
}

function renderSyslog(log) {
  const el = $('#syslog-stream');
  const tail = (log || State.get('systemLog')).slice(-6);
  el.innerHTML = tail.map(l => `<div><span class="tag">[${l.tag}]</span>${l.msg}</div>`).join('');
}

function renderStatusLine() {
  const host = $('#hud-status-line');
  host.innerHTML = `
    <span class="chip" id="chip-provider"><span class="dot"></span><span id="chip-provider-txt">AI ${(Settings.get('provider.id') || 'local').toUpperCase()}</span></span>
    <span class="chip" id="chip-mode"><span class="dot"></span>MODE <span id="chip-mode-txt">—</span></span>
    <span class="chip" id="chip-form"><span class="dot"></span><span id="chip-form-txt">UNFOLDED</span></span>
    <span class="chip" id="chip-offline" style="display:none"><span class="dot"></span>OFFLINE INTELLIGENCE</span>`;
  on('mode', (m) => { const e = $('#chip-mode-txt'); if (e) e.textContent = m.mode; });
  on('provider', (p) => { const e = $('#chip-provider-txt'); if (e) e.textContent = 'AI ' + (Settings.get('provider.id') || 'local').toUpperCase(); });
  on('formfactor', (ff) => { const e = $('#chip-form-txt'); if (e) e.textContent = ff.toUpperCase(); });
  on('net-change', () => { const e = $('#chip-offline'); if (e) e.style.display = navigator.onLine ? 'none' : ''; });
}
