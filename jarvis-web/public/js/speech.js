/**
 * Voice subsystem — Speech-to-Text + Text-to-Speech + wake word.
 * STT uses the platform's on-device/cloud recognizer when available (Web
 * Speech API); TTS uses the platform synthesis engine. Availability is probed
 * honestly and surfaced in the UI — never faked.
 */
import { State, emit } from './state.js';
import { Settings } from './settings.js';
import { play } from './audio-synth.js';
import { startVAD, stopVAD } from './audio-synth.js';

let recognition = null;
let listening = false;
let wakeLoop = false;
let ttsVoice = null;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function sttAvailable() { return !!SR; }

/** Initialize the speech recognizer singleton. */
function getRecognition(continuous = false) {
  if (!SR) return null;
  if (!recognition) {
    recognition = new SR();
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = 'en-US';
  }
  recognition.continuous = continuous;
  return recognition;
}

/** Begin a listening session. Resolves with final transcript or null. */
export function listenOnce({ onInterim, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const rec = getRecognition(false);
    if (!rec) { resolve(null); return; }
    let finalText = '';
    let timeout = setTimeout(finish, timeoutMs);
    let vadOk = null;

    const finish = () => {
      clearTimeout(timeout);
      if (vadOk) stopVAD();
      try { rec.stop(); } catch {}
      listening = false;
      State.patch({ voice: { ...State.get('voice'), listening: false, level: 0 } });
      emit('listen-end');
      resolve(finalText.trim() || null);
    };

    rec.onresult = (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(finish, 3500); // end-of-speech silence
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      State.patch({ voice: { ...State.get('voice'), interim, final: finalText } });
      onInterim && onInterim(finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        emit('stt-error', e.error);
      }
      if (e.error === 'no-speech') { /* keep waiting */ return; }
      finish();
    };
    rec.onend = () => { if (listening) finish(); };

    // waveform: try VAD meter; if the recognizer owns the mic it fails silently.
    startVAD((level) => {
      State.patch({ voice: { ...State.get('voice'), level } });
      emit('voice-level', level);
    }).then(ok => { vadOk = ok; }).catch(() => {});

    try {
      listening = true;
      State.patch({ voice: { ...State.get('voice'), listening: true, interim: '', final: '' } });
      State.setMode('LISTENING');
      play('listenStart');
      emit('listen-start');
      rec.start();
    } catch {
      finish();
    }
  });
}

export function cancelListening() {
  if (recognition) { try { recognition.stop(); } catch {} }
}

/* ── Wake word ────────────────────────────────────────────────────────────── */
export function startWakeWord() {
  if (!SR || wakeLoop) return false;
  wakeLoop = true;
  const rec = getRecognition(true);
  let buffer = '';
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        buffer += ' ' + r[0].transcript;
        const m = buffer.toLowerCase().match(/\b(jarvis|j\.a\.r\.v\.i\.s|hey jarvis|ok jarvis)\b/);
        if (m) {
          buffer = '';
          play('wake');
          emit('wake-word');
        }
        if (buffer.length > 400) buffer = buffer.slice(-200);
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') stopWakeWord();
    // transient errors: Chrome auto-restarts continuous recognition
  };
  try { rec.start(); } catch { stopWakeWord(); return false; }
  return true;
}

export function stopWakeWord() {
  wakeLoop = false;
  if (recognition) { try { recognition.stop(); } catch {} }
}

export function wakeWordActive() { return wakeLoop; }

/* ── TTS ──────────────────────────────────────────────────────────────────── */
export function ttsAvailable() { return 'speechSynthesis' in window; }

export function listVoices() {
  if (!ttsAvailable()) return [];
  return window.speechSynthesis.getVoices();
}

export function pickVoice() {
  if (!ttsAvailable()) return null;
  const voices = listVoices();
  const pref = Settings.get('voice.voiceURI');
  if (pref) {
    const v = voices.find(v => v.voiceURI === pref);
    if (v) return v;
  }
  return voices.find(v => /en[-_]GB/i.test(v.lang) && /male|daniel|arthur/i.test(v.name))
    || voices.find(v => /en[-_]GB/i.test(v.lang))
    || voices.find(v => /^en/i.test(v.lang))
    || voices[0] || null;
}

let speaking = false;
let speakQueue = [];

export function speak(text, { interrupt = true, onDone, force = false } = {}) {
  if (!ttsAvailable() || !Settings.get('voice.ttsEnabled')) return finishSpeak(onDone, false);
  // Focus mode suppresses spoken output unless explicitly forced.
  if (State.get('focusMode') && !force) return finishSpeak(onDone, false);

  const utter = (t) => {
    const u = new SpeechSynthesisUtterance(t);
    u.voice = ttsVoice || pickVoice();
    u.rate = Settings.get('voice.ttsRate') ?? 1.02;
    u.pitch = Settings.get('voice.ttsPitch') ?? 0.9;
    u.volume = Settings.get('voice.volume') ?? 0.85;
    u.onstart = () => {
      speaking = true;
      State.setMode('SPEAKING');
      emit('speak-start', { text: t });
    };
    u.onend = () => {
      speaking = false;
      emit('speak-end');
      if (State.get('mode') === 'SPEAKING') State.setMode('IDLE');
      finishSpeak(onDone, true);
    };
    u.onerror = () => {
      speaking = false;
      emit('speak-end');
      if (State.get('mode') === 'SPEAKING') State.setMode('IDLE');
      finishSpeak(onDone, false);
    };
    window.speechSynthesis.speak(u);
  };

  if (interrupt) {
    window.speechSynthesis.cancel();
    speaking = false;
    utter(text);
  } else {
    speakQueue.push({ text, onDone });
    if (!speaking) utter(speakQueue.shift().text);
  }
}

function finishSpeak(onDone, ok) {
  if (speakQueue.length && !speaking) {
    const next = speakQueue.shift();
    speak(next.text, { interrupt: false, onDone: next.onDone });
  }
  onDone && onDone(ok);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
  speaking = false;
  speakQueue = [];
  if (State.get('mode') === 'SPEAKING') State.setMode('IDLE');
}

export function isSpeaking() { return speaking; }

/** Keep the voice list fresh (voices load async in some browsers). */
export function initVoices() {
  if (!ttsAvailable()) return;
  const load = () => { ttsVoice = pickVoice(); };
  window.speechSynthesis.onvoiceschanged = load;
  load();
}
