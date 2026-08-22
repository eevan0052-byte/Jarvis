/**
 * AI Provider abstraction layer.
 * The app never hard-codes a single provider. Providers implement:
 *   { id, label, kind, available(), chat({system, messages, context}), explain(object) }
 * Switching happens in Settings → AI Engine; the Context Engine passes the
 * same context object to every provider.
 */
import { State, emit } from '../state.js';
import { Settings } from '../settings.js';
import { LocalProvider } from './local.js';
import { OpenAICompatProvider } from './openai-compat.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';

const REGISTRY = [
  LocalProvider,
  OpenAICompatProvider,
  AnthropicProvider,
  GeminiProvider,
];

export function listProviders() {
  return REGISTRY.map(P => ({
    id: P.id, label: P.label, kind: P.kind,
    needsKey: P.needsKey || false,
    configured: P.configured ? P.configured() : true,
  }));
}

export function getProvider(id) {
  const p = REGISTRY.find(P => P.id === id) || LocalProvider;
  return p;
}

/** Resolve the active provider, honoring network state (offline → local). */
export function activeProvider() {
  const wanted = Settings.get('provider.id') || 'local';
  const p = getProvider(wanted);
  const net = State.get('net');
  if (p.kind === 'cloud' && (!net.online || !p.configured())) {
    return { provider: LocalProvider, fallback: true, reason: !net.online ? 'offline' : 'not-configured' };
  }
  return { provider: p, fallback: false };
}

export async function setActiveProvider(id) {
  const p = getProvider(id);
  Settings.set('provider.id', id);
  State.patch({ provider: { id, label: p.label } });
  emit('provider', p);
  State.log(`AI engine: ${p.label}`, 'AI');
  return p;
}

/**
 * Unified chat entry point used by the conversation layer.
 * Returns {text, engine, fallbackReason}
 */
export async function chat(system, messages, context) {
  const { provider, fallback, reason } = activeProvider();
  try {
    const res = await provider.chat({ system, messages, context });
    if (res && typeof res.text === 'string' && res.text.trim()) {
      return { text: res.text, engine: provider.label, fallbackReason: fallback ? reason : null };
    }
    throw new Error('empty response');
  } catch (e) {
    console.warn('[ai] provider error → local fallback', provider.id, e);
    const local = await LocalProvider.chat({ system, messages, context });
    return { text: local.text, engine: LocalProvider.label, fallbackReason: 'provider-error' };
  }
}
