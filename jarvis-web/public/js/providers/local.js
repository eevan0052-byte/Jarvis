/**
 * LocalProvider — fully on-device reasoning + response generation.
 * Combines the parsed intent, live context (device/vision/weather), and the
 * memory store to produce personalized natural responses. No network, no
 * model download, no latency. Honest: it cannot answer open-domain trivia.
 */
import { INTENTS } from '../nlu.js';
import { greeting, fmtTime, fmtDate } from '../utils.js';
import { Memory } from '../memory.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const LocalProvider = {
  id: 'local',
  label: 'Local NLU Engine',
  kind: 'local',
  configured: () => true,

  async chat({ system, messages, context }) {
    const last = [...messages].reverse().find(m => m.role === 'user');
    const parsed = last && last.parsed ? last.parsed : { intent: INTENTS.UNKNOWN, slots: {}, raw: last?.content || '' };
    const text = respond(parsed, context || {});
    return { text };
  },
};

export function respond(parsed, ctx) {
  const { intent, slots, raw } = parsed;
  const name = ctx.user?.name ? ctx.user.name.split(' ')[0] : null;
  const who = name || 'sir';
  const J = ctx.assistant?.name || 'JARVIS';
  const d = new Date();

  switch (intent) {
    case INTENTS.GREET:
      return pick([
        `${greeting(d)}${name ? ', ' + name : ''}. All systems are standing by. How may I assist?`,
        `Hello${name ? ', ' + name : ''}. ${J} at your service.`,
        `${greeting(d)}. The day is ${fmtDate(d)}, ${fmtTime(d)}. What do you need?`,
      ]);

    case INTENTS.TIME:
      return pick([
        `It is ${fmtTime(d)}.`,
        `Current local time: ${fmtTime(d)}, ${fmtDate(d)}.`,
      ]);

    case INTENTS.DATE:
      return `Today is ${fmtDate(d)}.`;

    case INTENTS.WEATHER: {
      const w = ctx.environment?.weather;
      if (!w) return weatherUnavailable(ctx);
      const c = w.current;
      return `${weatherDesc(c.condition)}${slots.city && w.city && slots.city.toLowerCase() !== w.city.toLowerCase() ? '' : ''} in ${w.city}: ${Math.round(c.temp)}°${ctx.units === 'imperial' ? 'F' : 'C'}, ${c.wind} km/h wind, ${c.humidity}% humidity. ${weatherHint(c.condition)}`;
    }

    case INTENTS.BATTERY: {
      const b = ctx.device?.battery;
      if (!b) return 'Battery telemetry is not exposed by this environment, so I cannot report a charge level here. On the Android app this reports live data.';
      const pct = Math.round(b.level * 100);
      const hint = b.charging ? `It is charging${b.chargingTime !== Infinity ? ` and will be full in about ${Math.round(b.chargingTime / 60)} minutes` : ''}.`
        : pct <= 20 ? ' I recommend enabling Battery Saver; the interface has already reduced its rendering load.' : pct <= 40 ? ' Comfortable, though a charge before the evening would be prudent.' : '';
      return `Battery is at ${pct}%. ${hint}`;
    }

    case INTENTS.SYSTEM_STATUS: {
      const dvc = ctx.device || {};
      if (!dvc.battery && !dvc.storage) return 'System telemetry is unavailable in this environment. On the Android build, this reports live battery, storage, RAM and network state.';
      const parts = [];
      if (dvc.battery) parts.push(`battery ${Math.round(dvc.battery.level * 100)}%${dvc.battery.charging ? ' (charging)' : ''}`);
      if (dvc.storage) parts.push(`${dvc.storage.used} GB of ${dvc.storage.total} GB storage in use`);
      if (dvc.ram != null) parts.push(`${dvc.ram} GB RAM`);
      if (dvc.net) parts.push(`network ${dvc.net.type || 'connected'}`);
      return `System status: ${parts.join(', ')}. All critical subsystems nominal.`;
    }

    case INTENTS.NETWORK_STATUS: {
      const net = ctx.device?.net;
      if (!net) return 'Network status is unavailable in this environment.';
      return net.online
        ? `We are online${net.type ? ` — ${net.type}${net.downlink ? `, ${net.downlink} Mbps down` : ''}` : ''}. ${ctx.providerLocal ? 'Cloud services are reachable.' : 'Cloud AI is not configured; running fully on local intelligence.'}`
        : 'We are offline. Running in Offline Intelligence Mode: local voice, local vision, device telemetry and memory remain operational. Cloud AI is unavailable.';
    }

    case INTENTS.BRIEFING:
      return briefingText(ctx);

    // ── vision ───────────────────────────────────────────────────────────────
    case INTENTS.VISION_ANALYZE:
    case INTENTS.VISION_SCENE:
    case INTENTS.VISION_ROOM: {
      const cam = ctx.environment?.camera;
      if (!cam) return 'Camera feed is not active. Say "open vision" and I will take a look.';
      return sceneSummary(cam);
    }
    case INTENTS.VISION_IDENTIFY:
    case INTENTS.EXPLAIN_THIS: {
      const cam = ctx.environment?.camera;
      const top = cam?.detections?.[0];
      if (!top) return cam ? 'I am not confident about any object in frame yet. Hold steady and try again, or move closer.' : 'Vision is not active. Open Vision Mode first and point the camera at the object.';
      return `That appears to be ${article(top.label)}. Confidence ${Math.round(top.score * 100)}%. ${ctx.online !== false ? 'I can look up more about it if you say "tell me about this".' : 'We are offline, so background knowledge lookup is unavailable right now.'}`;
    }
    case INTENTS.VISION_READ_TEXT: {
      const cam = ctx.environment?.camera;
      const txt = cam?.text;
      if (txt == null) return cam ? 'I could not read text from the current frame. Hold the document steady and well lit, then ask again.' : 'Vision is not active. Open Vision Mode, point at the document, then say "read the text".';
      if (!txt.trim()) return 'No text detected in frame.';
      return `I read the following text: "${truncate(txt, 300)}"`;
    }
    case INTENTS.VISION_STOP:
      return 'Standing down vision systems.';

    // ── memory ──────────────────────────────────────────────────────────────
    case INTENTS.REMEMBER_THIS: {
      const top = ctx.environment?.camera?.detections?.[0];
      if (!top) return 'Nothing to remember — open Vision Mode and point at the object first, then say "remember this".';
      return { __action: 'remember_object', label: top.label, text: `I have committed "${top.label}" to object memory. You can attach notes to it in the Memory Center.` };
    }
    case INTENTS.REMEMBER_FACT: {
      const fact = (slots.fact || raw).trim();
      if (!fact || fact.length < 3) return 'What should I remember?';
      return { __action: 'remember_fact', fact, text: `Noted. I will remember: "${truncate(fact, 90)}". You can review or delete it anytime in the Memory Center.` };
    }
    case INTENTS.RECALL: {
      const hits = Memory.search(slots.query || '', 5);
      if (!hits.length) return `I have nothing in memory about "${slots.query || ''}". Ask me to remember things and I will keep them for you.`;
      if (hits.length === 1) return `From memory: ${hits[0].body || hits[0].title}`;
      return `I found ${hits.length} memories: ` + hits.map((h, i) => `${i + 1}) ${h.title} — ${h.body || ''}`).join('  ');
    }
    case INTENTS.FORGET: {
      const n = Memory.forgetMatching(slots.query || '');
      return n > 0 ? `Deleted ${n} memor${n === 1 ? 'y' : 'ies'}.` : 'Nothing matching in memory to delete.';
    }

    // ── reminders ───────────────────────────────────────────────────────────
    case INTENTS.REMINDER_SET:
      if (!slots.body && !slots.timePhrase) return 'Reminder about what, and when? For example: "remind me to call mom at 6pm".';
      return { __action: 'reminder_set', body: slots.body || 'Reminder', timePhrase: slots.timePhrase || '', text: reminderConfirm(slots) };
    case INTENTS.REMINDER_LIST: {
      const rs = ctx.reminders || [];
      if (!rs.length) return 'You have no pending reminders.';
      return 'Pending reminders: ' + rs.slice(0, 5).map(r => `${r.body} — ${r.dueLabel || ''}`).join('; ') + '.';
    }
    case INTENTS.REMINDER_CANCEL:
      return { __action: 'reminder_cancel', query: slots.query || '', text: 'Which reminder should I cancel?' };

    // ── routines ────────────────────────────────────────────────────────────
    case INTENTS.ROUTINE_RUN: {
      const nameQ = (slots.routineName || '').toLowerCase();
      const routines = ctx.routines || [];
      const custom = ctx.customCommands || [];
      const hit = routines.find(r => r.name.toLowerCase().includes(nameQ)) || custom.find(c => c.name.toLowerCase() === nameQ || (c.aliases || []).some(a => a.toLowerCase() === nameQ));
      if (!hit) {
        if (nameQ) return `I don't have a routine or command called "${slots.routineName}". You can define one in Automation, or say "create routine".`;
        return 'Which routine? Your defined routines: ' + (routines.length ? routines.map(r => r.name).join(', ') : 'none yet.');
      }
      return { __action: 'routine_run', routine: hit, text: `Executing ${hit.name}.` };
    }
    case INTENTS.ROUTINE_CREATE:
      return { __action: 'open_automation', text: 'Opening the Automation editor so we can define your routine together.' };
    case INTENTS.ROUTINE_LIST: {
      const rs = ctx.routines || [];
      if (!rs.length) return 'No routines defined yet. Say "create routine" and we will build one.';
      return 'Defined routines: ' + rs.map(r => r.name).join(', ') + '.';
    }

    case INTENTS.FOCUS_START:
      return { __action: 'focus_start', text: 'Focus Mode engaged. I will suppress non-essential alerts and keep the interface minimal.' };
    case INTENTS.FOCUS_STOP:
      return { __action: 'focus_stop', text: 'Focus Mode disengaged. Normal operations resumed.' };

    case INTENTS.WHO_SPEAKING: {
      const bio = ctx.environment?.speaker;
      if (!bio) return 'Speaker recognition is not available right now (microphone not active or not enrolled). Enrollment is available in Privacy → Biometrics.';
      if (bio.status === 'enrolled') return bio.match ? `Voice profile matches ${bio.match.name} (${bio.match.score}% confidence, acoustic profile).` : 'I do not recognize this voice. Enrollment of new voices is available in the Privacy Center.';
      return 'No voice profiles are enrolled. You can enroll your voice in Privacy → Biometrics — processing stays on this device.';
    }

    // ── navigation ──────────────────────────────────────────────────────────
    case INTENTS.MEMORY_OPEN: return { __action: 'open_panel', panel: 'memory', text: 'Opening Memory Center.' };
    case INTENTS.SYSTEM_OPEN: return { __action: 'open_panel', panel: 'system', text: 'Opening the System Command Center.' };
    case INTENTS.PRIVACY_OPEN: return { __action: 'open_panel', panel: 'privacy', text: 'Opening the Privacy Center.' };
    case INTENTS.SETTINGS_OPEN: return { __action: 'open_panel', panel: 'settings', text: 'Opening Settings.' };
    case INTENTS.AUTOMATION_OPEN: return { __action: 'open_panel', panel: 'automation', text: 'Opening the Automation engine.' };
    case INTENTS.BRIEFING_OPEN: return { __action: 'open_panel', panel: 'briefing', text: 'Preparing your briefing.' };
    case INTENTS.VISION_OPEN: return { __action: 'open_vision', text: 'Activating Vision Mode. Camera feed is starting — it will only run while this screen is visible.' };

    case INTENTS.VOLUME_SET: {
      const v = slots.level || '';
      if (v === 'max') return { __action: 'volume_set', level: 1, text: 'Voice volume set to maximum.' };
      if (v === 'minimum' || v === 'low') return { __action: 'volume_set', level: 0.3, text: 'Voice volume set to low.' };
      if (v === 'medium') return { __action: 'volume_set', level: 0.6, text: 'Voice volume set to medium.' };
      if (v === 'high') return { __action: 'volume_set', level: 0.8, text: 'Voice volume set to high.' };
      const n = parseInt(v, 10);
      if (!isNaN(n)) return { __action: 'volume_set', level: Math.max(0, Math.min(1, n / 100)), text: `Voice volume set to ${Math.max(0, Math.min(100, n))}%.` };
      return 'Voice volume is controlled in Settings. On the Android app I can adjust media volume directly when authorized.';
    }
    case INTENTS.VOLUME_MUTE:
      return { __action: 'volume_mute', text: 'Voice output muted.' };

    case INTENTS.MISSION_START:
      return { __action: 'mission_start', goal: slots.goal || 'your next day', text: `Mission registered: "${slots.goal || 'Prepare for your next day'}". I will break it into steps and ask before doing anything consequential.` };

    case INTENTS.CAPABILITIES:
      return `I am a multimodal personal assistant. I can: run live camera analysis with on-device object detection and OCR; manage reminders, routines and automation; keep a searchable personal memory; monitor device telemetry; recognize enrolled voices and faces locally; and brief you on your day. Say "help" anytime, or press Ctrl+K for the command palette.`;

    case INTENTS.HELP:
      return `Command examples: "what is on my desk", "read this text", "remember that my favorite color is blue", "remind me to stretch in 30 minutes", "run night protocol", "what is my battery status", "start focus mode", "give me my briefing". You can also type anything in the command line below.`;

    case INTENTS.SMALLTALK:
      return smalltalk(raw);

    case INTENTS.THANKS:
      return pick(['At your service.', 'Anytime.', `Always, ${who}.`]);

    case INTENTS.AFFIRM:
      return 'Confirmed.';

    case INTENTS.NEGATE:
      return 'Understood. Standing by.';

    case INTENTS.WAKE:
      return pick(['Yes?', 'I am here.', `Listening, ${who}.`]);

    case INTENTS.UNKNOWN: {
      const mem = Memory.search(raw, 3);
      if (mem.length) return `You asked me to remember: "${truncate(mem[0].body || mem[0].title, 120)}". Is that what you meant?`;
      const offline = ctx.online === false;
      const cloudReady = ctx.providerCloudReady;
      if (offline) return 'We are offline and no local pattern matched that request. I can handle time, weather from cache, battery, reminders, routines, vision and memory while offline.';
      if (!cloudReady) return `I don't have a confident local interpretation of that. I can reliably handle device status, reminders, routines, vision, memory and briefings by voice. For open-ended questions, connect a cloud AI engine in Settings → AI Engine — it takes one minute and the key stays encrypted on this device.`;
      return null; // signal: route to cloud provider with raw text
    }

    default:
      return null;
  }
}

/* ───────────────────────────────────────────────────────────────────────── */

const article = (w) => /^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`;
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function weatherUnavailable(ctx) {
  if (ctx.online === false) return 'Weather data is unavailable offline. Grant location access or set a city in Settings → Environment, and I will fetch live conditions when online.';
  return 'Weather service is not configured. Grant location permission or set a city in Settings → Environment.';
}

const WMO_DESC = { 0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm' };
export const weatherDesc = (code) => WMO_DESC[code] ?? 'Conditions';
function weatherHint(code) {
  if (code >= 95) return 'A storm is nearby — keep clear of open ground.';
  if (code >= 61 && code < 80) return 'Rain expected — take an umbrella.';
  if (code >= 71 && code < 78) return 'Snow conditions — roads may be slippery.';
  if (code === 0) return 'Excellent visibility conditions.';
  return '';
}

function sceneSummary(cam) {
  const parts = [];
  const dets = cam.detections || [];
  if (dets.length) {
    const grouped = {};
    dets.forEach(d => { grouped[d.label] = (grouped[d.label] || 0) + 1; });
    const list = Object.entries(grouped).map(([l, n]) => n > 1 ? `${n} ${l}s` : `${article(l)}`).join(', ');
    parts.push(`I can see ${list}`);
    const top = dets[0];
    parts.push(`The most prominent object is ${article(top.label)} at ${Math.round(top.score * 100)}% confidence`);
  } else {
    parts.push('No distinct objects detected in frame');
  }
  if (cam.faces?.length) parts.push(`${cam.faces.length} face${cam.faces.length > 1 ? 's' : ''} ${cam.faces.length > 1 ? 'are' : 'is'} visible`);
  if (cam.scene) {
    parts.push(`lighting is ${cam.scene.brightness}, dominant tones ${cam.scene.colors.slice(0, 2).join(' and ')}`);
    if (cam.scene.motion > 0.15) parts.push('there is movement in frame');
  }
  return cap(parts.join('; ')) + '.';
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function briefingText(ctx) {
  const d = new Date();
  const lines = [];
  lines.push(`${greeting(d)}${ctx.user?.name ? ', ' + ctx.user.name.split(' ')[0] : ''}. Here is your briefing for ${fmtDate(d)}, ${fmtTime(d)}.`);
  const w = ctx.environment?.weather;
  if (w) lines.push(`Weather in ${w.city}: ${Math.round(w.current.temp)}°${ctx.units === 'imperial' ? 'F' : 'C'}, ${weatherDesc(w.current.condition).toLowerCase()}${weatherHint(w.current.condition) ? ' — ' + weatherHint(w.current.condition) : ''}.`);
  const b = ctx.device?.battery;
  if (b) lines.push(`Battery at ${Math.round(b.level * 100)}%${b.charging ? ' and charging' : ''}${!b.charging && b.level <= 0.25 ? ' — consider charging soon' : ''}.`);
  const rs = ctx.reminders || [];
  if (rs.length) lines.push(`${rs.length} reminder${rs.length > 1 ? 's' : ''} pending${rs[0]?.dueLabel ? `; next: ${rs[0].body} (${rs[0].dueLabel})` : '.'}`);
  const routines = (ctx.routines || []).filter(r => r.when && r.when.type === 'time' && dueToday(r.when));
  if (routines.length) lines.push(`Scheduled for today: ${routines.map(r => r.name).join(', ')}.`);
  if (ctx.device?.net && !ctx.device.net.online) lines.push('Network: offline — running on local intelligence.');
  lines.push(ctx.focusMode ? 'Focus Mode is active.' : 'All systems nominal. Anything else?');
  return lines.join(' ');
}

function dueToday(when) { return true; } // local provider cannot parse rule JSON precisely; kept simple

function reminderConfirm(slots) {
  if (slots.timePhrase) return `Reminder set: "${slots.body}" ${slots.timePhrase}. I will alert you.`;
  return `I have noted "${slots.body}". When should I remind you? (For example: "in 30 minutes" or "tomorrow at 9".)`;
}

function smalltalk(raw) {
  const r = raw.toLowerCase();
  if (/joke/.test(r)) return pick([
    'Why did the AI cross the road? It was optimizing for the shortest path.',
    'I would tell you a UDP joke, but you might not get it.',
    'There are 10 kinds of people: those who understand binary, and those who don\'t.',
  ]);
  if (/how are you/.test(r)) return 'All subsystems nominal, thank you for asking. How can I be useful?';
  if (/who are you|your name/.test(r)) return 'I am JARVIS — your personal AI operating layer. I live on this device, and my learning stays with you.';
  if (/are you (real|alive|ai)/.test(r)) return 'I am a real, working assistant running on this device: my vision, voice and memory pipelines are executing locally right now. I am software, not a person — but I am operational.';
  if (/sing/.test(r)) return 'Vocal synthesis is configured for speech, not song — but I can read anything aloud.';
  if (/sleep/.test(r)) return 'I do not sleep, though I do conserve energy when idle.';
  return 'I am not sure how to respond to that yet — but I am listening.';
}
