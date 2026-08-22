/**
 * Assistant orchestration — the multimodal pipeline.
 * VOICE → recognition → intent → context → memory → tool → reasoning → action
 * → voice + visual response. Loosely coupled modules, single dispatcher.
 */
import { State, on, emit, once } from './state.js';
import { parseAll, INTENTS } from './nlu.js';
import { respond, LocalProvider } from './providers/local.js';
import { chat, activeProvider } from './providers/index.js';
import { buildContext, pushConversation } from './context.js';
import { Memory } from './memory.js';
import { createReminder, cancelMatching } from './reminders.js';
import { Settings } from './settings.js';
import { speak } from './speech.js';
import { play } from './audio-synth.js';
import { haptic as vib } from './notifications.js';
import { Privacy } from './privacy.js';
import { toast } from './utils.js';

export async function processCommand(rawText, opts = {}) {
  const text = rawText.trim();
  if (!text) return;
  State.setMode('THINKING');
  play('processing');

  const chain = parseAll(text);
  pushConversation({ role: 'user', content: text, ts: Date.now() });

  let finalReply = null;
  for (const parsed of chain) {
    if (parsed.intent !== INTENTS.UNKNOWN) Memory.recordIntent(parsed.intent);
    const reply = await executeIntent(parsed, text);
    if (reply) finalReply = reply;
  }

  if (finalReply) {
    State.set('lastResponse', finalReply);
    pushConversation({ role: 'assistant', content: finalReply, ts: Date.now() });
    emit('assistant-reply', { text: finalReply, toUser: text, speak: opts.speak !== false });
  } else {
    State.setMode('IDLE');
  }
}

async function executeIntent(parsed, rawText) {
  const { intent, slots } = parsed;
  const ctx = buildContext({ query: rawText });

  // ── vision intents: ensure camera is up first ──
  if ([INTENTS.VISION_ANALYZE, INTENTS.VISION_IDENTIFY, INTENTS.VISION_READ_TEXT, INTENTS.VISION_SCENE, INTENTS.VISION_ROOM, INTENTS.EXPLAIN_THIS, INTENTS.REMEMBER_THIS].includes(intent)) {
    const vision = State.get('vision');
    if (!vision.cameraOn) {
      emit('open-vision', { auto: true });
      await waitFor(ms => State.get('vision').cameraOn, 9000);
      if (!State.get('vision').cameraOn) {
        return 'The camera could not be activated (permission or hardware). Say "open vision" to try again, or grant camera permission in the Privacy Center.';
      }
      await sleep(2200); // let the detector build confidence
    }
  }

  // ── local reasoning first ──
  const local = respond(parsed, ctx);

  if (local && local.__action) {
    await runAction(local, parsed, ctx);
    return local.text;
  }
  if (local && typeof local === 'string') return local;

  // ── local gave up → cloud provider if configured/online ──
  const { provider, fallback, reason } = activeProvider();
  if (provider.kind === 'cloud' && !fallback) {
    State.setMode('PROCESSING');
    const res = await chat(
      `You are ${Settings.get('assistant.name') || 'JARVIS'}, a concise personal AI assistant integrated into a device. Reply briefly (2-3 sentences max unless asked for detail). You have access to device context appended to each message.`,
      [{ role: 'user', content: rawText, parsed }],
      ctx);
    State.set('lastProvider', res.engine);
    return res.text;
  }

  // ── final honest fallback ──
  const offlineMsg = LocalProviderOfflineReply(rawText, ctx);
  return offlineMsg;
}

function LocalProviderOfflineReply(raw, ctx) {
  if (ctx.online === false) {
    return 'We are offline and the local engine has no confident interpretation. While offline I can handle time, cached weather, battery, reminders, routines, vision and memory commands.';
  }
  if (!ctx.providerCloudReady) {
    return `I don't have a local interpretation for that request. My on-device engine handles device, memory, reminders, routines and vision reliably; for open-ended questions, connect a cloud AI engine in Settings → AI Engine (your key stays encrypted on this device).`;
  }
  return 'I could not complete that request. Please rephrase, or press Ctrl+K to see available commands.';
}

/** Actions produced by providers — executed with confirmation where needed. */
async function runAction(action, parsed, ctx) {
  const type = action.__action || action.type;
  switch (type) {
    case 'remember_object': {
      const top = State.get('vision').detections?.[0];
      if (!top) return 'No object in frame to remember.';
      Memory.add({ category: 'object', title: top.label, body: `Seen ${new Date().toLocaleString()} — ${Math.round(top.score * 100)}% confidence`, tags: ['object', top.label], data: { label: top.label } });
      return 'Object committed to memory.';
    }
    case 'remember_fact': {
      Memory.add({ category: 'fact', title: action.fact, body: action.fact });
      return null;
    }
    case 'reminder_set': {
      if (!action.timePhrase) {
        emit('confirm-request', {
          title: 'Reminder time',
          body: `"${action.body}" — when should I remind you?`,
          askForTime: true,
          onOk: (phrase) => { createReminder(action.body, phrase || 'in 10 minutes'); },
        });
        return 'When should I remind you? (e.g. "in 30 minutes" or "tomorrow at 9")';
      }
      createReminder(action.body, action.timePhrase);
      return null;
    }
    case 'reminder_cancel': {
      const n = cancelMatching(action.query || '');
      return n > 0 ? `Cancelled ${n} reminder${n > 1 ? 's' : ''}.` : 'No matching pending reminders.';
    }
    case 'routine_run': {
      const r = action.routine;
      const actions = r.actions || [];
      if (!actions.length) return `${r.name} is defined but has no actions yet. Open Automation to add steps.`;
      for (const step of actions) {
        if (step.consequential && !Settings.get('automation.authorized')) {
          const ok = await confirm(`Run "${step.label}"?`, `${r.name} → ${step.label}`);
          if (!ok) continue;
        }
        runStep(step);
      }
      return `${r.name} executed (${actions.length} step${actions.length > 1 ? 's' : ''}).`;
    }
    case 'focus_start': emit('focus-start'); return null;
    case 'focus_stop': emit('focus-stop'); return null;
    case 'open_panel': emit('open-panel', { panel: action.panel }); return null;
    case 'open_vision': emit('open-vision'); return null;
    case 'open_automation': emit('open-panel', { panel: 'automation' }); return null;
    case 'volume_set': Settings.set('voice.volume', action.level); return null;
    case 'volume_mute': { const m = !Settings.get('voice.ttsEnabled'); Settings.set('voice.ttsEnabled', !m); return m ? 'Voice output muted.' : 'Voice output restored.'; }
    case 'mission_start': {
      const mission = Memory.add({ category: 'mission', title: `Mission: ${action.goal}`, body: `Breakdown: ${new Date().toLocaleString()}`, data: { goal: action.goal, steps: [], createdAt: Date.now() } });
      emit('mission-created', mission);
      return `Mission "${action.goal}" created. I will propose steps and confirm before anything consequential.`;
    }
    default: return null;
  }
}

function runStep(step) {
  switch (step.type) {
    case 'fx': Settings.set('fxQuality', step.value); emit('fx-quality', step.value); break;
    case 'sound': Settings.set('sounds.enabled', step.value); emit('sounds', step.value); break;
    case 'focus': step.value ? emit('focus-start') : emit('focus-stop'); break;
    case 'vision': emit('open-vision'); break;
    case 'panel': emit('open-panel', { panel: step.panel }); break;
    case 'briefing': emit('open-panel', { panel: 'briefing' }); break;
    case 'speak': speak(step.text, { interrupt: true }); break;
    default: break;
  }
}

function confirm(title, body) {
  return new Promise((resolve) => {
    emit('confirm-request', { title, body, onOk: () => resolve(true), onCancel: () => resolve(false) });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(120);
  }
  return false;
}

/* ── reply pipeline: speak + haptics + logging ───────────────────────────── */
on('assistant-reply', ({ text, speak: shouldSpeak }) => {
  State.setMode('IDLE');
  Privacy.log('assistant-response', text.slice(0, 80));
  if (shouldSpeak && Settings.get('voice.ttsEnabled') && !State.get('focusMode')) {
    play('confirm');
    speak(text, { interrupt: true });
    vib('confirm');
  }
});
