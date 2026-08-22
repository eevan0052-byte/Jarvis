/**
 * Local NLU — on-device intent engine.
 * Rule/pattern-based intent detection with slot extraction and command
 * chaining. No network required. Runs in browser (this file) and is mirrored
 * in Kotlin for the Android app (core/nlu/LocalNluEngine.kt).
 */

export const INTENTS = {
  GREET: 'greet',
  TIME: 'time',
  DATE: 'date',
  WEATHER: 'weather',
  BATTERY: 'battery',
  SYSTEM_STATUS: 'system_status',
  NETWORK_STATUS: 'network_status',
  BRIEFING: 'briefing',
  VISION_ANALYZE: 'vision_analyze',
  VISION_IDENTIFY: 'vision_identify',
  VISION_READ_TEXT: 'vision_read_text',
  VISION_SCENE: 'vision_scene',
  VISION_ROOM: 'vision_room',
  VISION_STOP: 'vision_stop',
  REMEMBER_THIS: 'remember_this',
  REMEMBER_FACT: 'remember_fact',
  RECALL: 'recall',
  FORGET: 'forget',
  REMINDER_SET: 'reminder_set',
  REMINDER_LIST: 'reminder_list',
  REMINDER_CANCEL: 'reminder_cancel',
  ROUTINE_RUN: 'routine_run',
  ROUTINE_CREATE: 'routine_create',
  ROUTINE_LIST: 'routine_list',
  FOCUS_START: 'focus_start',
  FOCUS_STOP: 'focus_stop',
  WHO_SPEAKING: 'who_speaking',
  MEMORY_OPEN: 'memory_open',
  SYSTEM_OPEN: 'system_open',
  PRIVACY_OPEN: 'privacy_open',
  SETTINGS_OPEN: 'settings_open',
  AUTOMATION_OPEN: 'automation_open',
  VISION_OPEN: 'vision_open',
  BRIEFING_OPEN: 'briefing_open',
  VOLUME_SET: 'volume_set',
  VOLUME_MUTE: 'volume_mute',
  EXPLAIN_THIS: 'explain_this',
  MISSION_START: 'mission_start',
  HELP: 'help',
  CAPABILITIES: 'capabilities',
  WAKE: 'wake',
  THANKS: 'thanks',
  AFFIRM: 'affirm',
  NEGATE: 'negate',
  SMALLTALK: 'smalltalk',
  UNKNOWN: 'unknown',
};

const RULES = [
  // ── wake / session control ────────────────────────────────────────────────
  { i: INTENTS.WAKE, re: /^(jarvis|hey\s+jarvis|ok\s+jarvis|hey\s+jarvis\b.*|hello\s+jarvis)\s*$/i },
  { i: INTENTS.THANKS, re: /\b(thanks|thank you|thx|cheers|perfect|great|awesome|good job|nice)\b/i },
  { i: INTENTS.AFFIRM, re: /^(yes|yeah|yep|ok|okay|sure|go ahead|do it|confirm|please do|affirmative)\b/i },
  { i: INTENTS.NEGATE, re: /^(no|nope|nah|cancel|never ?mind|abort|not now)[.!?\s]*$|^stop[.!?\s]*$/i },

  // ── basics ────────────────────────────────────────────────────────────────
  { i: INTENTS.GREET, re: /\b(^hi|^hello|^hey|^good\s+(morning|afternoon|evening)|how are you|what'?s up|yo)\b/i },
  { i: INTENTS.TIME, re: /\bwhat('?s| is) the time\b|\bwhat time is it\b|\bcurrent time\b|\btell me the time\b/i },
  { i: INTENTS.DATE, re: /\bwhat('?s| is) (the|today'?s) date\b|\bwhat day is (it|today)\b|\btoday'?s date\b/i },
  { i: INTENTS.WEATHER, re: /\bweather\b|\btemperature outside\b|\bforecast\b|\bis it (raining|cold|hot|sunny|snowing)\b/i },
  { i: INTENTS.BATTERY, re: /\bbattery\b|\bpower level\b|\bcharge (level|status)\b|\bhow much (power|charge|battery)\b/i },
  { i: INTENTS.SYSTEM_STATUS, re: /\b(system|device) (status|health|stats|diagnostics)\b|\bstorage (status|space|left)\b|\bram usage\b|\bhow('?s| is) (the )?(device|system|phone) (doing|running)\b/i },
  { i: INTENTS.NETWORK_STATUS, re: /\bnetwork (status|connection)\b|\bam i (online|offline)\b|\bwifi status\b|\bconnectivity\b/i },
  { i: INTENTS.BRIEFING, re: /\b(briefing|brief me|morning brief|evening brief|daily brief|summary of (my|the) (day|morning|evening))\b/i },

  // ── vision ────────────────────────────────────────────────────────────────
  { i: INTENTS.VISION_ANALYZE, re: /\b(analyze|scan|inspect|examine)\s+(this|that|the scene|what'?s? in front of you|the camera|what you see)\b/i, stop: true },
  { i: INTENTS.VISION_ANALYZE, re: /\b(analyze|scan) (the )?(environment|room|area|desk|table|scene)\b/i },
  { i: INTENTS.VISION_IDENTIFY, re: /\b(what is|what'?s|identify|what are)\s+(this|that|these|those|it|the object|this object|this thing)\b/i },
  { i: INTENTS.VISION_IDENTIFY, re: /\bidentify (this|that|the) (object|thing|item|plant|device|product)\b/i },
  { i: INTENTS.VISION_READ_TEXT, re: /\b(read|extract|ocr)\s+(the )?(text|this text|that text|this document|that document|this page|the screen|this screen|the sign|this book)\b/i },
  { i: INTENTS.VISION_READ_TEXT, re: /\bread (what|that|this|it)\b.*\b(says|text|written)\b/i },
  { i: INTENTS.VISION_SCENE, re: /\b(summarize|describe)\s+(what you see|the scene|what'?s in front of you|your view|the camera view)\b/i },
  { i: INTENTS.VISION_ROOM, re: /\b(analyze|describe|scan) (this|the) room\b|\broom analysis\b|\bwhat kind of room\b/i },
  { i: INTENTS.EXPLAIN_THIS, re: /\b(explain|tell me about|what does|how does|what is .* used for)\s+(this|that|it|this object|that object)\b/i },
  { i: INTENTS.EXPLAIN_THIS, re: /\b(what is|what are) (this|that)\b.*\b(used for|for)\b/i },

  // ── memory ────────────────────────────────────────────────────────────────
  { i: INTENTS.REMEMBER_THIS, re: /\bremember (this|that|it|this object|that object)\s*[.!?]?\s*$/i, stop: true },
  { i: INTENTS.RECALL, re: /\b(what do you (remember|know) about|recall|do you remember)\s+(.+)/i, stop: true },
  { i: INTENTS.FORGET, re: /\b(forget|delete|erase|remove) (that|this|the memory|what you remember about)\b/i, stop: true },
  { i: INTENTS.REMEMBER_FACT, re: /\b(remember|note|memorize)\s+(that|this)?\s*.+/i, stop: true },
  { i: INTENTS.REMEMBER_FACT, re: /\b(i (like|love|prefer|hate|dislike)\b.*|my favorite\b.*|i am a\b.*|i work as\b.*|i live in\b.*)/i, stop: true },

  // ── reminders ─────────────────────────────────────────────────────────────
  { i: INTENTS.REMINDER_SET, re: /\bremind me\b/i, stop: true },
  { i: INTENTS.REMINDER_SET, re: /\bset (a |an )?(reminder|alarm)\b/i, stop: true },
  { i: INTENTS.REMINDER_LIST, re: /\b(show|list|what are) (my )?reminders\b|\bupcoming reminders\b/i },
  { i: INTENTS.REMINDER_CANCEL, re: /\b(cancel|delete|remove|clear) (the |my |that )?reminder\b/i, stop: true },

  // ── navigation ────────────────────────────────────────────────────────────
  // (above ROUTINE_RUN: "start/open X mode" must resolve to specific panels)
  { i: INTENTS.VISION_OPEN, re: /\b(open|start|activate|enable|launch)\s+(vision|the camera|camera mode|vision mode)\b/i },
  { i: INTENTS.VISION_STOP, re: /\b(stop|close|end|exit|disable)\s+(vision|camera|scan|scanning)\b/i },
  { i: INTENTS.MEMORY_OPEN, re: /\b(open|show|go to) (the |my )?memor(y|ies)\b|\bmemory center\b/i },
  { i: INTENTS.SYSTEM_OPEN, re: /\b(open|show) (the )?system (status|command center|center|page)\b/i },
  { i: INTENTS.PRIVACY_OPEN, re: /\b(open|show) (the )?privacy (center|settings|page)\b/i },
  { i: INTENTS.SETTINGS_OPEN, re: /\b(open|show) (the )?settings\b/i },
  { i: INTENTS.AUTOMATION_OPEN, re: /\b(open|show) (the )?automation(s)?\b/i },
  { i: INTENTS.BRIEFING_OPEN, re: /\b(open|show) (the |my )?briefing\b/i },

  // ── routines / automation / commands ─────────────────────────────────────
  // NOTE: ROUTINE_RUN must stay AFTER the specific intents above — it is the
  // catch-all for "run/start X" phrasing.
  { i: INTENTS.FOCUS_START, re: /\b(start|enable|activate|begin)\s+(the\s+|my\s+)?focus\s*(mode)?\b/i },
  { i: INTENTS.FOCUS_STOP, re: /\b(stop|end|disable|exit)\s+(the\s+|my\s+)?focus\s*(mode)?\b/i },
  { i: INTENTS.ROUTINE_CREATE, re: /\bcreate (a |an |new )?routine\b/i, stop: true },
  { i: INTENTS.ROUTINE_LIST, re: /\b(show|list) (my )?routines\b|\bmy routines\b/i },

  // ── biometrics ────────────────────────────────────────────────────────────
  { i: INTENTS.WHO_SPEAKING, re: /\bwho is (speaking|talking|this)\b|\bidentify (the |this )?(speaker|voice|person)\b|\bwho am i\b/i },

  // ── device control ────────────────────────────────────────────────────────
  { i: INTENTS.VOLUME_SET, re: /\b(set |change )?(the )?volume (to |at )?(\d{1,3}|max|minimum|low|medium|high)\b/i },
  { i: INTENTS.VOLUME_MUTE, re: /\b(mute|unmute|silence)\b/i },

  // ── mission / help ────────────────────────────────────────────────────────
  { i: INTENTS.MISSION_START, re: /\bhelp me (prepare for|get ready for|plan)\b/i, stop: true },
  { i: INTENTS.MISSION_START, re: /\b(start|create) (a |an )?mission\b/i, stop: true },
  { i: INTENTS.CAPABILITIES, re: /\bwhat can you do\b|\byour (capabilities|abilities|features)\b|\blist your (features|commands|abilities)\b/i },
  { i: INTENTS.HELP, re: /\b(help|how do i|how to)\b/i },

  // ── smalltalk ─────────────────────────────────────────────────────────────
  { i: INTENTS.SMALLTALK, re: /\b(how are you|tell me a joke|are you (real|alive|ai)|who are you|what is your name|do you sleep|sing)\b/i },

  // ── catch-all routine run: must be LAST (non-stop → first match wins) ────
  { i: INTENTS.ROUTINE_RUN, re: /\b(run|start|activate|execute|initiate|trigger)\s+(.+?)\s*(routine|protocol|mode)?$/i },
];

const STOP_WORDS = new Set(['please', 'can you', 'could you', 'would you', 'hey', 'ok', 'okay', 'jarvis', 'thanks', 'thank you', 'just', 'the', 'a', 'an']);

/**
 * Split a compound command on chain words.
 * "check my schedule, tell me if I have time, and start focus mode" → 3 commands.
 * Guards against splitting ordinary lists ("buy milk, eggs and bread").
 */
const CHAIN_VERBS = '(?:check|tell|show|start|stop|open|close|run|remind|set|create|analyze|what|who|when|read|explain|summarize|identify|scan|mute|unmute|enable|disable|help|give|remember|forget|find|how|do|can|could|please)';
export function splitChain(text) {
  const candidates = text
    .split(new RegExp(`\\s*,\\s*|\\s*;\\s*|\\s+(?:and\\s+)?then\\s+|\\s+and\\s+(?=${CHAIN_VERBS}\\b)`, 'i'))
    .map(s => s.trim()).filter(Boolean);
  if (candidates.length <= 1) return [text.trim()];
  const verbRe = new RegExp(`^(?:and\\s+)?${CHAIN_VERBS}\\b`, 'i');
  const valid = candidates.slice(1).every(p => verbRe.test(p));
  if (!valid) return [text.trim()];
  return candidates.map(p => p.replace(/^and\s+/i, '').trim());
}

/** Parse a command → {intent, slots, raw, confidence} */
export function parse(text) {
  const raw = (text || '').trim();
  if (!raw) return { intent: INTENTS.UNKNOWN, slots: {}, raw, confidence: 0 };
  const lower = raw.toLowerCase();

  let best = null;
  for (const rule of RULES) {
    const m = lower.match(rule.re);
    if (m) {
      if (rule.stop) {
        return build(rule.i, m, raw, lower, 0.97);
      }
      if (!best) best = { rule, m };
    }
  }
  if (best) return build(best.rule.i, best.m, raw, lower, 0.85);
  return { intent: INTENTS.UNKNOWN, slots: {}, raw, confidence: 0.1 };
}

function build(intent, m, raw, lower, confidence) {
  const slots = {};

  if (intent === INTENTS.REMINDER_SET) {
    let body = raw.replace(/^(.*?remind me|.*?set (a |an )?(reminder|alarm))\s*(to\s+|about\s+)?/i, '').trim();
    body = body.replace(/[,.!?]+$/g, '').trim();
    if (body) {
      const timeM = body.match(/\b(in\s+\d+\s*(seconds?|minutes?|hours?)|at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?)?|tonight|this\s+(morning|afternoon|evening))\b/i);
      if (timeM) {
        slots.timePhrase = timeM[0];
        slots.body = body.replace(timeM[0], '').replace(/\s+/g, ' ').replace(/^(to|about)\s+/i, '').trim();
      } else slots.body = body;
      if (slots.body) slots.body = slots.body.charAt(0).toUpperCase() + slots.body.slice(1);
    }
  }

  if (intent === INTENTS.REMEMBER_FACT) {
    let body = raw.replace(/^(.*?\b(remember|note|memorize)\s+(that\s+|this\s+)?)/i, '').trim();
    if (!body && m) body = m[0]?.trim() || '';
    slots.fact = body.replace(/^that\s+/i, '');
  }

  if (intent === INTENTS.RECALL) {
    slots.query = (m[3] || raw.replace(/^(what do you (remember|know) about|recall|do you remember)\s*/i, '')).trim();
  }

  if (intent === INTENTS.FORGET) {
    slots.query = raw.replace(/^(forget|delete|erase|remove)\s+(that|this|the memory|what you remember about)\s*/i, '').trim();
  }

  if (intent === INTENTS.REMINDER_CANCEL) {
    slots.query = raw.replace(/^(cancel|delete|remove|clear)\s+(the |my |that )?reminder(s)?\s*/i, '').trim();
  }

  if (intent === INTENTS.ROUTINE_RUN) {
    slots.routineName = (m[2] || '').trim();
    if (!slots.routineName) slots.routineName = raw.replace(/\b(run|start|activate|execute|initiate|trigger)\s+/i, '').replace(/\s*(routine|protocol|mode)$/i, '').trim();
  }

  if (intent === INTENTS.VOLUME_SET) {
    const v = (m[4] || '').toLowerCase();
    slots.level = v;
  }

  if (intent === INTENTS.MISSION_START) {
    slots.goal = raw.replace(/^(help me (prepare for|get ready for|plan)|start (a |an )?mission)\s*/i, '').trim() || 'my next day';
  }

  if (intent === INTENTS.WEATHER) {
    slots.city = raw.replace(/^(.*?weather|.*?forecast)\s*(in|for)?\s*/i, '').replace(/\?/g, '').trim();
    if (STOP_WORDS.has(slots.city.toLowerCase()) || !slots.city) slots.city = '';
  }

  if (intent === INTENTS.EXPLAIN_THIS || intent === INTENTS.VISION_IDENTIFY) slots.target = 'vision';
  if (intent === INTENTS.REMEMBER_THIS) slots.target = 'vision';
  if (intent === INTENTS.UNKNOWN) slots.query = raw;

  return { intent, slots, raw, confidence, chain: [] };
}

/** Parse possibly-chained command. Returns array of parsed commands. */
export function parseAll(text) {
  const parts = splitChain(text);
  return parts.map(parse);
}
