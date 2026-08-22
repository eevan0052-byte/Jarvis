import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { Memory, CATEGORIES } from '../public/js/memory.js';

test('memory CRUD', () => {
  Memory.wipe();
  const e = Memory.add({ category: 'fact', title: 'Favorite color', body: 'blue' });
  assert.equal(Memory.get(e.id).body, 'blue');
  Memory.update(e.id, { body: 'cyan' });
  assert.equal(Memory.get(e.id).body, 'cyan');
  assert.equal(Memory.all().length, 1);
  Memory.remove(e.id);
  assert.equal(Memory.all().length, 0);
});

test('memory search', () => {
  Memory.wipe();
  Memory.add({ category: 'preference', title: 'Coffee', body: 'prefers espresso in the morning', tags: ['drink'] });
  Memory.add({ category: 'note', title: 'Passwords', body: 'irrelevant note about gardening' });
  const hits = Memory.search('espresso');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, 'Coffee');
  const hits2 = Memory.search('coffee');
  assert.equal(hits2.length, 1);
});

test('memory categories', () => {
  Memory.wipe();
  Memory.add({ category: 'object', title: 'Laptop', body: 'Dell XPS' });
  Memory.add({ category: 'reminder', title: 'Call mom', body: '' });
  assert.equal(Memory.all('object').length, 1);
  assert.equal(Memory.all('reminder').length, 1);
  assert.ok(CATEGORIES.length >= 9);
});

test('memory stats', () => {
  Memory.wipe();
  Memory.recordIntent('battery');
  Memory.recordIntent('battery');
  Memory.recordIntent('weather');
  assert.equal(Memory.topIntents(1)[0].intent, 'battery');
  assert.ok(Memory.topHours(24).length > 0);
});

test('memory export/import roundtrip', () => {
  Memory.wipe();
  Memory.add({ category: 'fact', title: 'X', body: 'y' });
  const json = Memory.exportJson();
  Memory.wipe();
  Memory.importJson(json);
  assert.equal(Memory.all().length, 1);
  assert.equal(Memory.all()[0].title, 'X');
});
