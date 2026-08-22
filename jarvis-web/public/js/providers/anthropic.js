/** Anthropic provider (Claude). Browser-direct CORS is supported via the
 *  dangerous-direct-browser-access header (documented by Anthropic). */
import { Settings } from '../settings.js';
import { Vault } from '../secrets.js';

export const AnthropicProvider = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  kind: 'cloud',
  needsKey: true,
  configured() { return Settings.get('providers.anthropic.keySet') === true; },

  async chat({ system, messages, context }) {
    const cfg = Settings.get('providers.anthropic');
    const body = {
      model: cfg.model || 'claude-3-5-haiku-latest',
      max_tokens: 700,
      system: system + (context ? buildContextBlock(context) : ''),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (cfg.mode === 'relay') {
      const res = await fetch('/api/proxy/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return { text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() };
    }
    const key = await Vault.getKey('anthropic');
    if (!key) throw new Error('No API key configured for this provider.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return { text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() };
  },
};

function buildContextBlock(ctx) {
  if (!ctx) return '';
  const d = new Date();
  const lines = [`Current local time: ${d.toLocaleString()}.`];
  if (ctx.user?.name) lines.push(`User's name: ${ctx.user.name}. Response style: ${ctx.user.style || 'balanced'}.`);
  const b = ctx.device?.battery;
  if (b) lines.push(`Device battery: ${Math.round(b.level * 100)}% ${b.charging ? '(charging)' : ''}.`);
  const w = ctx.environment?.weather;
  if (w) lines.push(`Weather in ${w.city || '—'}: ${Math.round(w.current.temp)}°C.`);
  if (ctx.environment?.camera?.detections?.length) {
    lines.push(`Camera detections: ${ctx.environment.camera.detections.slice(0, 8).map(d => d.label).join(', ')}.`);
  }
  const mems = ctx.memory?.relevant || [];
  if (mems.length) lines.push(`Relevant memories: ${mems.map(m => m.title + (m.body ? ': ' + m.body : '')).join(' | ')}`);
  return '\n\n[DEVICE CONTEXT]\n' + lines.join('\n');
}
