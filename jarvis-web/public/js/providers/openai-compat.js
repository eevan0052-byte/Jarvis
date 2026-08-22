/**
 * OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Ollama, LM Studio, …).
 * Key handling: Vault (encrypted at rest) or relay mode via /api/proxy/openai.
 * The API key never appears in source code or logs.
 */
import { Settings } from '../settings.js';
import { Vault } from '../secrets.js';

export const OpenAICompatProvider = {
  id: 'openai',
  label: 'OpenAI-compatible',
  kind: 'cloud',
  needsKey: true,
  configured() { return Settings.get('providers.openai.keySet') === true; },

  async chat({ system, messages, context }) {
    const cfg = Settings.get('providers.openai');
    const body = {
      model: cfg.model || 'gpt-4o-mini',
      max_tokens: 700,
      messages: [
        { role: 'system', content: system + buildContextBlock(context) },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    };
    const res = await call(cfg, body);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return { text: data.choices?.[0]?.message?.content?.trim() || '' };
  },
};

async function call(cfg, body) {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (cfg.mode === 'relay') {
    return fetch('/api/proxy/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const key = await Vault.getKey('openai');
  if (!key) throw new Error('No API key configured for this provider.');
  return fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

function buildContextBlock(ctx) {
  if (!ctx) return '';
  const d = new Date();
  const lines = [
    `Current local time: ${d.toLocaleString()}.`,
  ];
  if (ctx.user?.name) lines.push(`User's name: ${ctx.user.name}. Response style preference: ${ctx.user.style || 'balanced'}.`);
  const b = ctx.device?.battery;
  if (b) lines.push(`Device battery: ${Math.round(b.level * 100)}% ${b.charging ? '(charging)' : ''}.`);
  if (ctx.device?.net) lines.push(`Network: ${ctx.device.net.online ? `online (${ctx.device.net.type || 'unknown'})` : 'offline'}.`);
  const w = ctx.environment?.weather;
  if (w) lines.push(`Weather in ${w.city}: ${Math.round(w.current.temp)}°C, ${w.current.condition}.`);
  if (ctx.environment?.camera?.detections?.length) {
    lines.push(`Current camera detections: ${ctx.environment.camera.detections.slice(0, 8).map(d => `${d.label} (${Math.round(d.score * 100)}%)`).join(', ')}.`);
  }
  if (ctx.environment?.camera?.text) {
    lines.push(`Text currently visible to camera: "${ctx.environment.camera.text.slice(0, 500)}"`);
  }
  const mems = ctx.memory?.relevant || [];
  if (mems.length) lines.push(`Relevant memories: ${mems.map(m => m.title + (m.body ? ': ' + m.body : '')).join(' | ')}`);
  const rems = ctx.reminders || [];
  if (rems.length) lines.push(`Pending reminders: ${rems.map(r => r.body).join(' | ')}`);
  return '\n\n[DEVICE CONTEXT — provided by the JARVIS context engine]\n' + lines.join('\n');
}
