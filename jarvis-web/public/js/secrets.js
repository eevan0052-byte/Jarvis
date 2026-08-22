/**
 * Secret vault — WebCrypto AES-256-GCM.
 * API keys for cloud providers are encrypted at rest. The vault key is derived
 * (PBKDF2, 310k iterations) from a user PIN. If no PIN is set, keys are held
 * only in memory for the session and never persisted (documented to the user).
 * Keys are NEVER embedded in source, never logged, never sent anywhere except
 * the provider endpoint the user configured.
 */
const VAULT_SALT = 'jarvis.vault.salt.v1';
const VAULT_BOX = 'jarvis.vault.box.v1';

let sessionPin = null;        // in-memory only
let cachedKey = null;

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function deriveKey(pin, salt) {
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const Vault = {
  /** True when a PIN is active and keys survive reloads (still encrypted). */
  get persistent() { return !!localStorage.getItem(VAULT_SALT); },
  get unlocked() { return !!cachedKey; },

  async unlock(pin) {
    const saltB64 = localStorage.getItem(VAULT_SALT);
    if (!saltB64) throw new Error('No vault set up. Call Vault.setup(pin) first.');
    const key = await deriveKey(pin, unb64(saltB64));
    // verify by attempting to decrypt a canary
    const box = JSON.parse(localStorage.getItem(VAULT_BOX) || 'null');
    if (box) {
      try { await aesGcmDecrypt(key, box.canary); } catch { throw new Error('Incorrect PIN.'); }
    }
    cachedKey = key; sessionPin = pin;
  },

  async setup(pin) {
    if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pin, salt);
    const canary = await aesGcmEncrypt(key, new TextEncoder().encode('jarvis-canary'));
    localStorage.setItem(VAULT_SALT, b64(salt));
    localStorage.setItem(VAULT_BOX, JSON.stringify({ canary }));
    cachedKey = key; sessionPin = pin;
  },

  lock() { cachedKey = null; sessionPin = null; },

  /** Encrypt a provider key. Falls back to session-only storage when locked. */
  async putKey(providerId, apiKey) {
    if (!cachedKey) return { stored: false, reason: 'vault-locked' };
    const box = JSON.parse(localStorage.getItem(VAULT_BOX) || '{}');
    box[providerId] = await aesGcmEncrypt(cachedKey, new TextEncoder().encode(apiKey));
    localStorage.setItem(VAULT_BOX, JSON.stringify(box));
    return { stored: true };
  },

  async getKey(providerId) {
    if (cachedKey) {
      const box = JSON.parse(localStorage.getItem(VAULT_BOX) || '{}');
      if (box[providerId]) {
        try {
          const pt = await aesGcmDecrypt(cachedKey, box[providerId]);
          return new TextDecoder().decode(pt);
        } catch { return null; }
      }
      return null;
    }
    return sessionKeys[providerId] || null;
  },

  async removeKey(providerId) {
    const box = JSON.parse(localStorage.getItem(VAULT_BOX) || '{}');
    delete box[providerId];
    localStorage.setItem(VAULT_BOX, JSON.stringify(box));
    delete sessionKeys[providerId];
  },

  async destroy() {
    localStorage.removeItem(VAULT_SALT);
    localStorage.removeItem(VAULT_BOX);
    cachedKey = null; sessionPin = null;
    for (const k of Object.keys(sessionKeys)) delete sessionKeys[k];
  },

  /** Session-only (no PIN) mode. */
  setSessionKey(providerId, key) { if (key) sessionKeys[providerId] = key; else delete sessionKeys[providerId]; },
};

const sessionKeys = {};

async function aesGcmEncrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: b64(iv), data: b64(ct) };
}
async function aesGcmDecrypt(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return pt;
}
