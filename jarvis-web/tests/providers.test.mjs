import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { respond } from '../public/js/providers/local.js';
import { parse } from '../public/js/nlu.js';
import { listProviders, getProvider, activeProvider } from '../public/js/providers/index.js';
import { Settings } from '../public/js/settings.js';
import { State } from '../public/js/state.js';

const ctxBase = {
  user: { name: 'Ada', style: 'balanced' },
  assistant: { name: 'JARVIS' },
  units: 'metric',
  online: true,
  providerCloudReady: false,
  focusMode: false,
  device: { battery: { level: 0.72, charging: false }, net: { online: true, type: '4g' }, storage: { used: 12, total: 64 }, ram: 8 },
  environment: { weather: { city: 'Lille', current: { temp: 17, condition: 2, wind: 12, humidity: 55 } }, camera: null, speaker: null },
  memory: { count: 0, relevant: [] },
  reminders: [],
  routines: [],
  customCommands: [],
  history: [],
};

test('registry lists local + 3 cloud providers', () => {
  const ps = listProviders();
  assert.equal(ps.length, 4);
  assert.ok(ps.some(p => p.id === 'local'));
  assert.ok(ps.some(p => p.needsKey));
});

test('offline → local fallback with reason', () => {
  State.patch({ net: { online: false } });
  Settings.set('provider.id', 'openai');
  const { provider, fallback, reason } = activeProvider();
  assert.equal(provider.id, 'local');
  assert.equal(fallback, true);
  assert.equal(reason, 'offline');
  State.patch({ net: { online: true } });
});

test('local responses: battery uses real telemetry', () => {
  const r = respond(parse('what is my battery status'), ctxBase);
  assert.match(r, /72%/);
});

test('local responses: weather composes conditions', () => {
  const r = respond(parse('what is the weather'), ctxBase);
  assert.match(r, /Lille/);
  assert.match(r, /17°/);
});

test('local responses: unknown → honest message when no cloud, null when cloud ready', () => {
  const r = respond(parse('explain quantum field theory in depth'), ctxBase);
  assert.match(r, /cloud|local/i);
  const r2 = respond(parse('explain quantum field theory in depth'), { ...ctxBase, providerCloudReady: true });
  assert.equal(r2, null);
});

test('local responses: vision without camera is honest', () => {
  const r = respond(parse('what is on my desk'), ctxBase);
  assert.match(r, /camera|vision/i);
});

test('local responses: reminder action payload', () => {
  const r = respond(parse('remind me to call mom at 6pm'), ctxBase);
  assert.equal(r.__action, 'reminder_set');
  assert.equal(r.text.includes('call mom') || r.text.includes('Call mom'), true);
});

test('local responses: memory recall fallback when empty', () => {
  const r = respond(parse('what do you remember about the office'), ctxBase);
  assert.match(r, /nothing in memory|office/i);
});

test('local responses: capability listing', () => {
  const r = respond(parse('what can you do'), ctxBase);
  assert.match(r, /vision|memory/i);
});
