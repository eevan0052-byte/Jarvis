/**
 * JARVIS — entry point.
 * Boot → subsystems → HUD → onboarding → main loop.
 */
import { State, on, once, emit } from './state.js';
import { $, greeting, toast } from './utils.js';
import { Settings, applyA11yClasses } from './settings.js';
import { initDevice } from './device.js';
import { runBoot } from './ui/boot.js';
import { CoreRenderer } from './core-renderer.js';
import { initHud } from './ui/hud.js';
import { initConversation, addMessage } from './ui/conversation.js';
import { initPanels } from './ui/panels.js';
import { initMemoryPanel } from './ui/memory-ui.js';
import { initVision } from './ui/vision-ui.js';
import { initPalette } from './ui/command-palette.js';
import { initOnboarding } from './onboarding.js';
import { processCommand } from './assistant.js';
import { initVoices, startWakeWord, stopWakeWord } from './speech.js';
import { schedule, checkDue } from './reminders.js';
import { evaluate, handleFired } from './automation.js';
import { buildContext, predict } from './context.js';
import { refreshWeather } from './weather.js';
import { haptic, requestPermission } from './notifications.js';
import { SFX } from './audio-synth.js';
import { Privacy } from './privacy.js';
import { toast as toastFn } from './utils.js';

const S = Settings.all();

function main() {
  applyA11yClasses();
  applyFormFactor();
  initVoices();
  initPanels();
  initConversation();
  initHud();
  initMemoryPanel();
  initVision();
  initPalette();
  initDevice();
  initFormFactorControls();
  initSuggestions();
  initAutomationLoop();
  initFocus();
  initWakeWord();
  initWeather();
  initClockGreeting();
  initServiceWorker();

  const core = new CoreRenderer($('#core-canvas'));
  window.__core = core;
  core.start();
  on('formfactor', () => core.layout());
  setInterval(() => { window.__jarvisFps = core ? Math.round(core.fpsEma) : null; }, 2000);

  // boot (also runs onboarding afterwards)
  once('boot-done', () => {
    if (!S.onboarding.done) initOnboarding();
    else {
      addMessage('sys', 'All systems restored from local state.');
    }
    refreshWeather().catch(() => {});
  });
  runBoot();
}

/* ── form factor (fold simulation + auto) ────────────────────────────────── */
function applyFormFactor(ff) {
  const mode = ff || Settings.get('formFactor') || 'auto';
  const auto = mode === 'auto' ? (innerWidth < 700 ? 'cover' : 'open') : mode;
  const app = $('#app');
  app.classList.remove('fold-open', 'fold-cover', 'fold-ambient');
  app.classList.add(`fold-${auto}`);
  State.patch({ formFactor: auto, folded: auto === 'cover' });
  emit('formfactor', auto);
  if (window.__core) window.__core.layout();
}

function initFormFactorControls() {
  const set = (ff) => { Settings.set('formFactor', ff); applyFormFactor(ff); haptic('confirm'); };
  $('#ff-cover').addEventListener('click', () => set('cover'));
  $('#ff-open').addEventListener('click', () => set('open'));
  $('#ff-ambient').addEventListener('click', () => set('ambient'));
  window.addEventListener('resize', () => { if (Settings.get('formFactor') === 'auto') applyFormFactor('auto'); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
      const cur = State.get('formFactor');
      set(cur === 'open' ? 'cover' : 'open');
    }
  });
  applyFormFactor();
}

/* ── predictive suggestions ──────────────────────────────────────────────── */
function initSuggestions() {
  const row = $('#suggestion-row');
  let shown = [];
  const render = () => {
    if (State.get('focusMode')) { row.innerHTML = ''; return; }
    const ctx = buildContext();
    const preds = predict(ctx).filter(p => !shown.includes(p.id + p.title));
    if (!preds.length) return;
    row.innerHTML = preds.slice(0, 3).map(p =>
      `<span class="suggestion" data-act="${p.action || ''}" data-id="${p.id}">${p.icon} ${p.title} — ${p.body}</span>`).join('');
    row.querySelectorAll('.suggestion').forEach(el => el.addEventListener('click', () => {
      const act = el.dataset.act;
      shown.push(el.dataset.id);
      if (act === 'focus_start') emit('focus-start');
      if (act === 'battery_saver') { Settings.set('fxQuality', 'low'); emit('fx-quality', 'low'); toastFn('Battery Saver: rendering reduced.', 'ok'); }
      if (act === 'save_city') { import('./ui/settings-ui.js').then(() => emit('open-panel', { panel: 'settings' })); }
      if (act === 'vision_open') emit('open-vision');
      row.innerHTML = '';
    }));
  };
  render();
  setInterval(render, 20000);
  on('device-refresh', render);
}

/* ── automation watcher ──────────────────────────────────────────────────── */
function initAutomationLoop() {
  setInterval(() => {
    const fired = evaluate();
    fired.forEach(handleFired);
    checkDue();
  }, 10000);
  schedule();
}

/* ── focus mode ──────────────────────────────────────────────────────────── */
function initFocus() {
  on('focus-start', () => {
    State.patch({ focusMode: true });
    $('#app').classList.add('focus');
    $('#p-focus').textContent = 'ACTIVE — minimal alerts';
    Privacy.log('focus-started');
  });
  on('focus-stop', () => {
    State.patch({ focusMode: false });
    $('#app').classList.remove('focus');
    $('#p-focus').textContent = 'Inactive';
  });
}

/* ── wake word ───────────────────────────────────────────────────────────── */
function initWakeWord() {
  on('wake-word-toggle', (onFlag) => {
    if (onFlag) {
      const ok = startWakeWord();
      if (ok) toast('Wake word active — say "Jarvis". (Uses platform recognizer; disable in Settings.)', 'ok');
      else toast('Wake word unavailable in this browser.', 'err');
    } else stopWakeWord();
  });
  on('wake-word', () => {
    import('./ui/conversation.js').then(async (c) => {
      c.addMessage('sys', 'Wake word detected.');
      const { listenOnce } = await import('./speech.js');
      const text = await listenOnce({ timeoutMs: 8000 });
      if (text) { c.addMessage('user', text); processCommand(text); }
    });
  });
}

/* ── weather init ────────────────────────────────────────────────────────── */
function initWeather() {
  const w = Settings.get('weather');
  if (w.lat && w.lon) refreshWeather().catch(() => {});
}

/* ── greeting line ───────────────────────────────────────────────────────── */
function initClockGreeting() {
  const el = $('#greeting-line');
  const update = () => {
    const name = Settings.get('user.name');
    el.textContent = `${greeting()}${name ? ', ' + name.split(' ')[0] : ''}`;
  };
  update();
  setInterval(update, 60000);
}

/* ── service worker (offline shell + models) ─────────────────────────────── */
function initServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sandboxed iframes can't — graceful */ });
  }
}

/* ── notices / confirm wiring ────────────────────────────────────────────── */
on('notice', (n) => {
  const holder = $('#notice-center');
  const el = document.createElement('div');
  el.className = 'notice ' + (n.kind || 'notice');
  el.innerHTML = `
    <span class="ico">${n.icon || '◈'}</span>
    <div style="flex:1">
      <div class="t">${n.title}</div>
      <div class="b">${n.body}</div>
      ${n.ruleId ? `<div class="act"><button class="btn" data-ok>Accept</button><button class="btn ghost" data-no>Dismiss</button></div>` : ''}
    </div>
    <button class="x" data-x>✕</button>`;
  holder.appendChild(el);
  const rm = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); };
  el.querySelector('[data-x]').addEventListener('click', rm);
  el.querySelector('[data-no]')?.addEventListener('click', rm);
  el.querySelector('[data-ok]')?.addEventListener('click', () => { emit('confirm-request', { title: n.title, body: n.body, onOk: () => {} }); rm(); });
  if (!n.sticky) setTimeout(rm, 12000);
  setTimeout(() => { while (holder.children.length > 4) holder.removeChild(holder.firstChild); }, 100);
});

// bottom control buttons
function initControls() {
  $('#ctl-vision').addEventListener('click', () => emit('open-vision'));
  $('#ctl-memory').addEventListener('click', () => emit('open-panel', { panel: 'memory' }));
  $('#ctl-automation').addEventListener('click', () => emit('open-panel', { panel: 'automation' }));
  $('#ctl-system').addEventListener('click', () => emit('open-panel', { panel: 'system' }));
  $('#ctl-settings').addEventListener('click', () => emit('open-panel', { panel: 'settings' }));
  $('#ctl-voice').addEventListener('click', () => import('./ui/conversation.js').then(c => c.addMessage('sys', 'Tap the orb ◈ to speak.')));
  // briefing via status chip double-tap
  $('#chip-status').addEventListener('dblclick', () => emit('open-panel', { panel: 'briefing' }));
}
initControls();

// global error boundary
window.addEventListener('error', (e) => {
  console.error('[jarvis]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[jarvis] unhandled', e.reason);
});

Privacy.log('system-boot', 'application started');
main();
