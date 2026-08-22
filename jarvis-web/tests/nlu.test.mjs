import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { parse, parseAll, splitChain, INTENTS } from '../public/js/nlu.js';

test('intent: battery', () => {
  const r = parse('what is my battery status');
  assert.equal(r.intent, INTENTS.BATTERY);
});
test('intent: vision identify', () => {
  const r = parse('what is this object');
  assert.equal(r.intent, INTENTS.VISION_IDENTIFY);
});
test('intent: reminder with time slot', () => {
  const r = parse('remind me to call mom at 6pm');
  assert.equal(r.intent, INTENTS.REMINDER_SET);
  assert.equal(r.slots.body, 'Call mom');
  assert.equal(r.slots.timePhrase, 'at 6pm');
});
test('intent: reminder with duration slot', () => {
  const r = parse('set a reminder to stretch in 30 minutes');
  assert.equal(r.intent, INTENTS.REMINDER_SET);
  assert.match(r.slots.body, /stretch/i);
  assert.match(r.slots.timePhrase, /in 30 minutes/);
});
test('intent: remember fact', () => {
  const r = parse('remember that my favorite color is blue');
  assert.equal(r.intent, INTENTS.REMEMBER_FACT);
  assert.match(r.slots.fact, /favorite color is blue/i);
});
test('intent: recall', () => {
  const r = parse('what do you remember about the office');
  assert.equal(r.intent, INTENTS.RECALL);
  assert.match(r.slots.query, /office/i);
});
test('intent: routine run extracts name', () => {
  const r = parse('run night protocol');
  assert.equal(r.intent, INTENTS.ROUTINE_RUN);
  assert.match(r.slots.routineName, /night/i);
});
test('intent: mission', () => {
  const r = parse('help me prepare for tomorrow');
  assert.equal(r.intent, INTENTS.MISSION_START);
  assert.match(r.slots.goal, /tomorrow/i);
});
test('intent: system status', () => {
  assert.equal(parse('system status').intent, INTENTS.SYSTEM_STATUS);
});
test('intent: focus', () => {
  assert.equal(parse('start focus mode').intent, INTENTS.FOCUS_START);
  assert.equal(parse('stop focus mode').intent, INTENTS.FOCUS_STOP);
});
test('chain splitting', () => {
  const parts = splitChain('check my schedule, tell me if I have enough time, and start my focus mode');
  assert.equal(parts.length, 3);
  const parsed = parseAll('check my schedule, tell me if I have enough time, and start my focus mode');
  assert.equal(parsed.length, 3);
  assert.equal(parsed[2].intent, INTENTS.FOCUS_START);
});
test('volume slots', () => {
  const r = parse('set the volume to 80');
  assert.equal(r.intent, INTENTS.VOLUME_SET);
  assert.equal(r.slots.level, '80');
});
test('wake word', () => {
  assert.equal(parse('Jarvis').intent, INTENTS.WAKE);
  assert.equal(parse('hey jarvis').intent, INTENTS.WAKE);
});
test('unknown fallback', () => {
  const r = parse('xyzzy plugh frobnicate');
  assert.equal(r.intent, INTENTS.UNKNOWN);
});
test('weather city slot', () => {
  const r = parse('what is the weather in Paris');
  assert.equal(r.intent, INTENTS.WEATHER);
  assert.match(r.slots.city, /paris/i);
});
