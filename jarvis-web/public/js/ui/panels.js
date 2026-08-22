/** Panel manager — sheets, confirm dialog, close handling. */
import { State, on, emit } from './../state.js';
import { $, $$ } from './../utils.js';
import { play, SFX } from './../audio-synth.js';
import { haptic } from './../notifications.js';

export function initPanels() {
  // close buttons
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closePanel()));

  $$('.sheet-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => { if (e.target === bd) closePanel(); });
  });

  on('open-panel', ({ panel }) => openPanel(panel));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  // confirm dialog
  $('#confirm-no').addEventListener('click', () => {
    closeConfirm();
    window.__confirmCancel && window.__confirmCancel();
  });
  $('#confirm-ok').addEventListener('click', () => {
    const timeInput = $('#confirm-time-input');
    const cb = window.__confirmOk;
    closeConfirm();
    cb && cb(timeInput ? timeInput.value : undefined);
  });

  on('confirm-request', (req) => {
    $('#confirm-title').textContent = req.title || 'Confirm';
    $('#confirm-body').innerHTML = `<p style="font-size:0.84rem;line-height:1.6">${req.body || ''}</p>` + (req.askForTime ? `<input id="confirm-time-input" style="width:100%;margin-top:12px" placeholder="e.g. in 30 minutes, tomorrow at 9">` : '');
    $('#confirm-dialog').classList.add('open');
    window.__confirmOk = req.onOk;
    window.__confirmCancel = req.onCancel;
    play('alert');
    haptic('error');
  });
}

function closeConfirm() { $('#confirm-dialog').classList.remove('open'); }

export function openPanel(id) {
  const el = $(`#panel-${id}`);
  if (!el) return;
  closePanel();
  el.classList.add('open');
  State.set('panel', id);
  play('keyTick');
  emit('panel-opened', id);
  // refresh dynamic panels
  if (id === 'memory') import('./memory-ui.js').then(m => m.renderMemory());
  if (id === 'privacy') import('./privacy-ui.js').then(m => m.renderPrivacy());
  if (id === 'system') import('./system-ui.js').then(m => m.renderSystem());
  if (id === 'automation') import('./automation-ui.js').then(m => m.renderAutomation());
  if (id === 'settings') import('./settings-ui.js').then(m => m.renderSettings());
  if (id === 'briefing') import('./briefing-ui.js').then(m => m.renderBriefing());
}

export function closePanel() {
  $$('.sheet-backdrop').forEach(b => b.classList.remove('open'));
  State.set('panel', null);
}
