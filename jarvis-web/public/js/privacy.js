/**
 * Privacy Center data model + audit log + data lifecycle.
 * Shows exactly what JARVIS can access and what it has accessed, with
 * per-capability delete options. Biometric templates are encrypted at rest.
 */
import { State, emit } from './state.js';
import { Settings } from './settings.js';

const AUDIT_KEY = 'jarvis.audit.v1';

export const CAPABILITIES = [
  { id: 'microphone', label: 'Microphone', icon: '🎙', desc: 'Used for voice commands, voice activity level and optional voice enrollment. Audio is processed locally and never stored after analysis.', needsPerm: 'microphone', os: 'browser' },
  { id: 'camera', label: 'Camera', icon: '◎', desc: 'Used only while Vision Mode is open, with a visible indicator. Frames are analyzed on-device and never uploaded.', needsPerm: 'camera', os: 'browser' },
  { id: 'notifications', label: 'Notifications', icon: '◈', desc: 'Used for reminders and predictions you authorize. Can be revoked at any time.', needsPerm: 'notifications', os: 'browser' },
  { id: 'location', label: 'Location', icon: '⌖', desc: 'Optional, for weather and arrival routines. Never shared. You can use a manual city instead.', needsPerm: 'geolocation', os: 'browser' },
  { id: 'speaker', label: 'Voice biometrics', icon: '∿', desc: 'Acoustic voiceprint used only to recognize enrolled speakers. Experimental and not security-grade. Encrypted at rest, processed locally.', biometric: true },
  { id: 'face', label: 'Face biometrics', icon: '◉', desc: 'Optional face enrollment for personalization. Landmark templates only — encrypted at rest, processed locally.', biometric: true },
  { id: 'memory', label: 'Personal memory', icon: '◈', desc: 'Facts, preferences and reminders you ask me to keep. Viewable, editable and deletable in the Memory Center.', local: true },
  { id: 'storage', label: 'Local storage', icon: '▤', desc: 'Settings and memory persist on this device only. No accounts, no telemetry, no cloud sync.', local: true },
  { id: 'cloud-ai', label: 'Cloud AI (optional)', icon: '☁', desc: 'Only if you connect your own provider key. Your conversations are sent to that provider when you use it; the key is encrypted at rest.', external: true },
];

let audit = loadAudit();

function loadAudit() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}
function persistAudit() {
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(audit)); } catch {}
}

export const Privacy = {
  capabilities: () => CAPABILITIES.map(c => ({
    ...c,
    granted: permissionState(c.needsPerm),
    enabled: capabilityEnabled(c),
  })),

  audit() { return [...audit].reverse(); },

  log(event, detail = '') {
    if (!Settings.get('privacy.auditLog')) return;
    audit.push({ ts: Date.now(), event, detail });
    if (audit.length > 500) audit = audit.slice(-500);
    persistAudit();
    emit('audit', { event, detail });
  },

  clearAudit() { audit = []; persistAudit(); emit('audit', null); },

  /** Delete everything the user has stored: memory, profiles, settings, audit. */
  async wipeAllData() {
    const { SpeakerId } = await import('./speaker.js');
    SpeakerId.wipe();
    const { FaceId } = await import('./faceid.js');
    FaceId.wipe();
    const { Memory } = await import('./memory.js');
    Memory.wipe();
    const { Vault } = await import('./secrets.js');
    await Vault.destroy();
    localStorage.removeItem('jarvis.voiceprint.v1');
    localStorage.removeItem('jarvis.facetemplate.v1');
    localStorage.removeItem('jarvis.audit.v1');
    Settings.reset();
    State.log('All local data wiped at user request', 'PRIVACY');
  },

  async exportAll() {
    const { Memory } = await import('./memory.js');
    return {
      exportedAt: new Date().toISOString(),
      memory: Memory.all(),
      audit: audit,
    };
  },
};

function permissionState(perm) {
  if (!perm || !navigator.permissions?.query) return 'unsupported';
  return 'queryable'; // real value is resolved async by the UI
}

function capabilityEnabled(c) {
  if (c.id === 'speaker') return Settings.get('privacy.speakerId') !== false;
  if (c.id === 'face') return Settings.get('privacy.faceId') !== false;
  if (c.id === 'cloud-ai') return Settings.get('provider.id') !== 'local';
  return true;
}

export async function realPermissionState(name) {
  try {
    const st = await navigator.permissions.query({ name });
    return st.state; // 'granted' | 'denied' | 'prompt'
  } catch { return 'unsupported'; }
}

export function permLabel(state) {
  return { granted: 'Granted', denied: 'Blocked', prompt: 'Ask on use', unsupported: 'Unavailable' }[state] || state;
}
