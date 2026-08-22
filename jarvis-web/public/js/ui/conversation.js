/** Conversation panel + voice orb + input handling. */
import { State, on, once, emit } from './../state.js';
import { $, esc } from './../utils.js';
import { processCommand } from './../assistant.js';
import { listenOnce, cancelListening, ttsAvailable } from './../speech.js';
import { haptic } from './../notifications.js';
import { play } from './../audio-synth.js';
import { Settings } from './../settings.js';
import { Privacy } from './../privacy.js';

export function initConversation() {
  const conv = $('#conversation');
  const input = $('#conv-input');
  const sendBtn = $('#conv-send');
  const micBtn = $('#conv-mic');
  const orb = $('#voice-orb');

  const showConv = () => conv.classList.add('open');
  $('#controls-row').addEventListener('click', (e) => {
    if (e.target.closest('#voice-orb')) return;
    showConv();
  });

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    Privacy.log('command-typed', text.slice(0, 80));
    processCommand(text);
  };
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { conv.classList.remove('open'); } });
  micBtn.addEventListener('click', () => listen());

  // voice orb — tap to speak
  orb.addEventListener('click', () => {
    if (State.get('voice').listening) { cancelListening(); return; }
    listen();
  });

  on('assistant-reply', ({ text, toUser, speak }) => {
    addMessage('assistant', text, toUser, speak);
  });
  on('listen-start', () => {
    conv.classList.add('open');
    orb.classList.add('listening');
    haptic('listen');
  });
  on('listen-end', () => orb.classList.remove('listening'));
  on('speak-start', () => orb.classList.add('speaking'));
  on('speak-end', () => orb.classList.remove('speaking'));
  on('stt-error', (code) => {
    addMessage('sys', `Speech recognition blocked (${code}). You can type commands, or grant microphone permission in the Privacy Center.`);
  });
  on('notice', (n) => {
    addMessage('sys', `◈ ${n.title}: ${n.body}`);
  });

  input.addEventListener('focus', showConv);

  // welcome message after boot
  once('boot-done', () => {
    const name = Settings.get('assistant.name') || 'JARVIS';
    const results = State.get('boot').checks || {};
    const stt = results.stt === 'ok';
    addMessage('assistant', `${name.toUpperCase()} ONLINE. ` + (stt ? 'Voice channel is ready — say "Jarvis" or tap the orb, then speak.' : 'Voice recognition is unavailable in this browser — type commands below instead. Vision, memory and automation are fully operational.'), null, false);
    if (stt) emit('greet-ready');
  });
}

async function listen() {
  if (!State.get('voice').available) {
    addMessage('sys', 'Speech recognition is unavailable in this browser. Type your command below.');
    return;
  }
  if (State.get('voice').listening) return;
  const text = await listenOnce({ timeoutMs: 9000 });
  if (text) {
    addMessage('user', text);
    Privacy.log('command-voice', text.slice(0, 80));
    processCommand(text);
  } else {
    State.setMode('IDLE');
    play('listenEnd');
  }
}

export function addMessage(role, text, toUser, speak) {
  const holder = $('#conv-messages');
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.innerHTML = esc(text).replace(/\n/g, '<br>');
  const engine = State.get('lastProvider');
  if (role === 'assistant' && engine) {
    el.innerHTML += `<span class="engine-tag">engine: ${esc(engine)}</span>`;
  }
  holder.appendChild(el);
  holder.scrollTop = holder.scrollHeight;
  while (holder.children.length > 40) holder.removeChild(holder.firstChild);
  return el;
}
