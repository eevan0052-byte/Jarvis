/** Google Gemini provider. */
import { Settings } from '../settings.js';
import { Vault } from '../secrets.js';

export const GeminiProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  kind: 'cloud',
  needsKey: true,
  configured() { return Settings.get('providers.gemini.keySet') === true; },

  async chat({ system, messages, context }) {
    const cfg = Settings.get('providers.gemini');
    const model = cfg.model || 'gemini-1.5-flash';
    const sysBlock = system + (context ? buildContextBlock(context) : '');
    const body = {
      system_instruction: { parts: [{ text: sysBlock }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 700 },
    };
    const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    if (cfg.mode === 'relay') {
      const res = await fetch(`/api/proxy/gemini`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: body.contents.map(c => ({ role: c.role, content: c.parts.map(p => p.text).join('\n') })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return { text: extractText(data) };
    }
    const key = await Vault.getKey('gemini');
    if (!key) throw new Error('No API key configured for this provider.');
    const res = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return { text: extractText(data) };
  },
};

function extractText(data) {
  return (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('').trim();
}

function buildContextBlock(ctx) {
  if (!ctx) return '';
  const d = new Date();
  const lines = [`Current local time: ${d.toLocaleString()}.`];
  if (ctx.user?.name) lines.push(`User's name: ${ctx.user.name}. Response style: ${ctx.user.style || 'balanced'}.`);
  const b = ctx.device?.battery;
  if (b) lines.push(`Device battery: ${Math.round(b.level * 100)}% ${b.charging ? '(charging)' : ''}.`);
  const w = ctx.environment?.weather;
  if (w) lines.push(`Weather: ${w.city} ${Math.round(w.current.temp)}°C.`);
  if (ctx.environment?.camera?.detections?.length) {
    lines.push(`Camera detections: ${ctx.environment.camera.detections.slice(0, 8).map(d => d.label).join(', ')}.`);
  }
  const mems = ctx.memory?.relevant || [];
  if (mems.length) lines.push(`Relevant memories: ${mems.map(m => m.title + (m.body ? ': ' + m.body : '')).join(' | ')}`);
  return '\n\n[DEVICE CONTEXT]\n' + lines.join('\n');
}
