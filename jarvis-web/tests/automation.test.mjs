import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { listRules, saveRule, deleteRule, evaluate, defaultTemplates } from '../public/js/automation.js';
import { Memory } from '../public/js/memory.js';
import { State } from '../public/js/state.js';

test('rule lifecycle', () => {
  Memory.wipe();
  const id = saveRule({ name: 'T', when: { type: 'battery', params: { op: 'below', level: 20 } }, then: { kind: 'action', action: 'battery_saver' } });
  assert.equal(listRules().length, 1);
  deleteRule(id);
  assert.equal(listRules().length, 0);
});

test('battery condition fires below threshold only', () => {
  Memory.wipe();
  saveRule({ name: 'Low', when: { type: 'battery', params: { op: 'below', level: 20 } }, then: { kind: 'notify', message: 'low' } });
  State.patch({ device: { battery: { level: 0.15, charging: false } }, net: { online: true } });
  assert.equal(evaluate().length, 1);
  State.patch({ device: { battery: { level: 0.8, charging: false } } });
  assert.equal(evaluate().length, 0);
});

test('network condition', () => {
  Memory.wipe();
  saveRule({ name: 'Online', when: { type: 'network', params: { state: 'online' } }, then: { kind: 'suggest', message: 'back' } });
  State.patch({ device: { battery: { level: 0.8, charging: false } }, net: { online: false } });
  assert.equal(evaluate().length, 0);
  State.patch({ net: { online: true } });
  assert.equal(evaluate().length, 1);
});

test('time condition matches at the right minute', () => {
  Memory.wipe();
  const d = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  saveRule({ name: 'Now', when: { type: 'time', params: { time: hm } }, then: { kind: 'notify', message: 'now' } });
  State.patch({ device: { battery: { level: 0.8, charging: false } }, net: { online: true } });
  assert.equal(evaluate().length, 1);
});

test('templates are well-formed', () => {
  for (const t of defaultTemplates()) {
    assert.ok(t.name);
    assert.ok(t.when && t.when.type);
    assert.ok(t.then && (t.then.kind === 'suggest' || t.then.kind === 'action' || t.then.kind === 'notify'));
  }
});
