import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { Vault } from '../public/js/secrets.js';

test('vault roundtrip: setup → put → lock → unlock → get', async () => {
  await Vault.destroy();
  await Vault.setup('1234');
  await Vault.putKey('openai', 'sk-test-secret-key');
  Vault.lock();
  assert.equal(await Vault.getKey('openai'), null); // locked → nothing readable
  await Vault.unlock('1234');
  assert.equal(await Vault.getKey('openai'), 'sk-test-secret-key');
});

test('vault wrong PIN rejected', async () => {
  await Vault.destroy();
  await Vault.setup('1234');
  Vault.lock();
  await assert.rejects(() => Vault.unlock('9999'), /PIN/);
});

test('vault session-only mode works without setup', async () => {
  await Vault.destroy();
  Vault.setSessionKey('gemini', 'ai-key-xyz');
  assert.equal(await Vault.getKey('gemini'), 'ai-key-xyz');
});

test('vault destroy wipes everything', async () => {
  await Vault.destroy();
  await Vault.setup('1234');
  await Vault.putKey('openai', 'k');
  await Vault.destroy();
  assert.equal(Vault.persistent, false);
  assert.equal(await Vault.getKey('openai'), null);
});
