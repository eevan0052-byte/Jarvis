import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { buildContext, predict } from '../public/js/context.js';
import { State } from '../public/js/state.js';
import { Memory } from '../public/js/memory.js';
import { Settings } from '../public/js/settings.js';

function seedState() {
  Memory.wipe();
  State.patch({
    device: { battery: { level: 0.15, charging: false }, storage: { used: 5, total: 64 }, ram: 8, cores: 8, net: { online: true, type: '4g' } },
    net: { online: true, type: '4g' },
    weather: { city: 'Lille', current: { temp: 18, condition: 2 }, source: 'Open-Meteo', ts: Date.now() },
    vision: { active: false, detections: [], faces: [], textLines: null, scene: null },
    formFactor: 'open',
    focusMode: false,
  });
}

test('context assembles user/device/environment', () => {
  seedState();
  Settings.set('user.name', 'Ada');
  const ctx = buildContext({ query: '' });
  assert.equal(ctx.user.name, 'Ada');
  assert.equal(ctx.device.battery.level, 0.15);
  assert.equal(ctx.environment.weather.city, 'Lille');
  assert.equal(ctx.online, true);
  assert.ok(Array.isArray(ctx.reminders));
});

test('predict: low battery suggestion', () => {
  seedState();
  const ctx = buildContext();
  const preds = predict(ctx);
  assert.ok(preds.some(p => p.id === 'batt' && p.action === 'battery_saver'));
});

test('predict: no battery spam when charging', () => {
  seedState();
  State.patch({ device: { ...State.get('device'), battery: { level: 0.1, charging: true } } });
  const ctx = buildContext();
  assert.ok(!predict(ctx).some(p => p.id === 'batt'));
});

test('predict: offline notice', () => {
  seedState();
  State.patch({ net: { online: false, type: 'offline' } });
  const ctx = buildContext();
  assert.ok(predict(ctx).some(p => p.id === 'offline'));
});
