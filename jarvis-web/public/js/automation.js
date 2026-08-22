/**
 * Automation Engine — safe, user-authored routines.
 *
 * Rule shape:
 *   { id, name, when: {type, params}, then: {kind: 'suggest'|'notify'|'action', action, message},
 *     enabled, autoRun, lastFiredAt }
 *
 * Consequential actions always require confirmation UNLESS the user has
 * explicitly enabled autoRun for that rule.
 */
import { Memory } from './memory.js';
import { uid, toast } from './utils.js';
import { State, emit } from './state.js';
import { Settings } from './settings.js';

const FIRED_THROTTLE = 5 * 60_000; // do not re-fire the same rule within 5 min

export function listRules() {
  return Memory.all('routine').map(e => ({ ...e.data, id: e.id, name: e.title, enabled: e.data.enabled !== false }));
}

export function saveRule({ id, name, when, then, enabled = true, autoRun = false }) {
  const data = { when, then, enabled, autoRun, lastFiredAt: 0 };
  if (id) { Memory.update(id, { title: name, data, tags: ['auto'] }); return id; }
  return Memory.add({ category: 'routine', title: name, body: describe(when, then), data, tags: ['auto'] }).id;
}

export function deleteRule(id) { Memory.remove(id); }

export function toggleRule(id, enabled) {
  const e = Memory.get(id);
  if (!e) return;
  Memory.update(id, { data: { ...e.data, enabled } });
}

function describe(when, then) {
  const w = when.type === 'time' ? `At ${when.params.time}` :
    when.type === 'battery' ? `When battery ${when.params.op} ${when.params.level}%` :
    when.type === 'charging' ? `When ${when.params.state}` :
    when.type === 'network' ? `When network becomes ${when.params.state}` : 'Manually';
  return `IF ${w} → ${then.kind === 'suggest' ? `suggest: ${then.message}` : `run: ${then.action}`}`;
}

/** Evaluate all enabled rules against the live state. Returns suggestions. */
export function evaluate(now = Date.now()) {
  const dev = State.get('device') || {};
  const battery = dev.battery || State.get('battery');
  const net = State.get('net');
  const results = [];

  for (const rule of listRules()) {
    if (!rule.enabled) continue;
    if (now - (rule.lastFiredAt || 0) < FIRED_THROTTLE) continue;
    if (!match(rule.when, { battery, net, now })) continue;
    results.push(rule);
  }
  return results;
}

function match(when, env) {
  switch (when.type) {
    case 'time': {
      const [h, m] = (when.params.time || '00:00').split(':').map(Number);
      const d = new Date(env.now);
      return d.getHours() === h && d.getMinutes() === m;
    }
    case 'battery': {
      if (!env.battery) return false;
      const lvl = Math.round(env.battery.level * 100);
      return when.params.op === 'below' ? lvl < when.params.level : lvl > when.params.level;
    }
    case 'charging':
      return !!env.battery && env.battery.charging === (when.params.state === 'charging');
    case 'network':
      return env.net && env.net.online === (when.params.state === 'online');
    default:
      return false;
  }
}

export const ACTIONS = {
  battery_saver: {
    label: 'Enable Battery Saver',
    run: () => {
      Settings.set('fxQuality', 'low');
      emit('fx-quality', 'low');
      State.log('Battery Saver engaged — rendering quality reduced.', 'AUTO');
    },
  },
  focus_start: {
    label: 'Start Focus Mode',
    run: () => emit('focus-start', { silent: true }),
  },
  focus_stop: { label: 'End Focus Mode', run: () => emit('focus-stop', { silent: true }) },
  vision_open: { label: 'Open Vision Mode', run: () => emit('open-vision') },
  briefing: { label: 'Show Briefing', run: () => emit('open-panel', { panel: 'briefing' }) },
  mute_sounds: { label: 'Mute sounds', run: () => { Settings.set('sounds.enabled', false); emit('sounds', false); } },
  unmute_sounds: { label: 'Unmute sounds', run: () => { Settings.set('sounds.enabled', true); emit('sounds', true); } },
};

/** Trigger handler: given fired rules, produce suggestions/notices/actions. */
export function handleFired(rule) {
  Memory.update(rule.id, { data: { ...Memory.get(rule.id).data, lastFiredAt: Date.now() } });
  const then = rule.then;
  if (then.kind === 'action' && then.action && ACTIONS[then.action]) {
    if (rule.autoRun) {
      ACTIONS[then.action].run();
      toast(`Automation "${rule.name}" executed: ${ACTIONS[then.action].label}`, 'ok');
    } else {
      emit('confirm-request', {
        title: `Routine: ${rule.name}`,
        body: `${ACTIONS[then.action].label}? (Enable auto-run in Automation to skip this prompt.)`,
        onOk: () => ACTIONS[then.action].run(),
      });
    }
  } else {
    emit('notice', { title: rule.name, body: then.message || describe(rule.when, rule.then), icon: '⚙', kind: then.kind === 'notify' ? 'notice' : 'suggest', ruleId: rule.id });
  }
}

export function defaultTemplates() {
  return [
    {
      name: 'Evening wind-down', when: { type: 'time', params: { time: '22:30' } },
      then: { kind: 'suggest', message: 'Time for your evening routine — I can mute sounds and dim the interface. Want that?' },
    },
    {
      name: 'Low battery alert', when: { type: 'battery', params: { op: 'below', level: 20 } },
      then: { kind: 'action', action: 'battery_saver' },
    },
    {
      name: 'Back online', when: { type: 'network', params: { state: 'online' } },
      then: { kind: 'suggest', message: 'Network restored. Cloud AI and weather are available again.' },
    },
  ];
}
