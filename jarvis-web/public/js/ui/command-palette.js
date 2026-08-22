/** Command palette — Ctrl+K. Speak or type; natural interpretation. */
import { $, $$ } from './../utils.js';
import { processCommand } from './../assistant.js';
import { play } from './../audio-synth.js';

const SUGGESTIONS = [
  { k: '◎', cmd: 'Open Vision Mode', d: 'camera + on-device object detection' },
  { k: '◈', cmd: 'Show my memories', d: 'open the Memory Center' },
  { k: '⌘', cmd: 'Show system status', d: 'live device telemetry' },
  { k: '◉', cmd: 'Give me my briefing', d: 'time, weather, power, reminders' },
  { k: '⚙', cmd: 'Create a routine', d: 'open the Automation editor' },
  { k: '∿', cmd: 'Who is speaking', d: 'local voice profile check' },
  { k: '◷', cmd: 'Remind me to take a break in 30 minutes', d: 'set a reminder' },
  { k: '⌁', cmd: 'Run night protocol', d: 'custom command example' },
  { k: '▮', cmd: 'What is my battery status', d: 'power telemetry' },
  { k: '✛', cmd: 'Open settings', d: 'configure JARVIS' },
];

let open = false;
let sel = 0;

export function initPalette() {
  const palette = $('#command-palette');
  const input = $('#palette-input');
  const list = $('#palette-list');

  const openPalette = () => {
    if (open) return;
    open = true;
    sel = 0;
    palette.classList.add('open');
    input.value = '';
    renderList('');
    setTimeout(() => input.focus(), 60);
    play('keyTick');
  };
  const closePalette = () => { open = false; palette.classList.remove('open'); };

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? closePalette() : openPalette(); }
    if (!open) return;
    if (e.key === 'Escape') closePalette();
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, currentItems.length - 1); renderList(input.value, true); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderList(input.value, true); }
    if (e.key === 'Enter') {
      const items = currentItems;
      const chosen = items[sel];
      if (chosen) { input.value = chosen; closePalette(); execute(chosen); }
    }
  });

  palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

  let currentItems = [];
  function renderList(q, keepSel = false) {
    const ql = q.toLowerCase();
    currentItems = ql ? SUGGESTIONS.filter(s => s.cmd.toLowerCase().includes(ql)) : SUGGESTIONS;
    if (!keepSel) sel = 0;
    list.innerHTML = currentItems.map((s, i) =>
      `<div class="palette-item ${i === sel ? 'sel' : ''}" data-i="${i}">
        <span class="k">${s.k}</span><span>${s.cmd}</span><span class="d">${s.d}</span><span class="hint">↵</span>
      </div>`).join('') || `<div class="palette-item"><span class="d">No matches — press Enter to run as typed.</span></div>`;
    $$('#palette-list .palette-item[data-i]').forEach(el => el.addEventListener('click', () => {
      const chosen = currentItems[+el.dataset.i];
      if (chosen) { closePalette(); execute(chosen); }
    }));
  }
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !currentItems.length) { const v = input.value; closePalette(); v && execute(v); } });

  function execute(text) {
    processCommand(text);
  }
}
