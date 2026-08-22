import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { decodeYolo, nms } from '../public/js/vision.js';

test('decodeYolo: empty/zero tensor yields no detections', () => {
  const raw = new Float32Array(84 * 8400); // all zeros
  const boxes = decodeYolo(raw, 640, 640);
  assert.equal(boxes.length, 0);
});

test('decodeYolo: strong synthetic detection decodes to sane box (pixel-space coords)', () => {
  const raw = new Float32Array(84 * 8400);
  const nAnchors = 8400;
  const idx = 1234; // any anchor
  raw[0 * nAnchors + idx] = 320.5;             // cx in pixels
  raw[1 * nAnchors + idx] = 320.5;             // cy
  raw[2 * nAnchors + idx] = 200.0;             // w
  raw[3 * nAnchors + idx] = 100.0;             // h
  raw[(4 + 0) * nAnchors + idx] = 0.9;         // person score
  const boxes = decodeYolo(raw, 640, 640);
  assert.ok(boxes.length >= 1);
  const b = boxes.find(x => x.label === 'person');
  assert.ok(b);
  assert.ok(Math.abs((b.x1 + b.x2) / 2 - 320.5) < 1); // center maps to ~320px
  assert.ok(Math.abs((b.x2 - b.x1) - 200) < 1);
});

test('nms suppresses duplicate boxes of same class', () => {
  const boxes = [
    { x1: 0, y1: 0, x2: 100, y2: 100, score: 0.9, label: 'cat' },
    { x1: 2, y1: 2, x2: 102, y2: 102, score: 0.85, label: 'cat' },
    { x1: 300, y1: 300, x2: 400, y2: 400, score: 0.8, label: 'dog' },
  ];
  const kept = nms(boxes, 0.45);
  assert.equal(kept.length, 2);
  assert.ok(kept.some(b => b.label === 'cat' && b.score === 0.9));
  assert.ok(kept.some(b => b.label === 'dog'));
});

test('nms keeps different classes that overlap', () => {
  const boxes = [
    { x1: 0, y1: 0, x2: 100, y2: 100, score: 0.9, label: 'person' },
    { x1: 0, y1: 0, x2: 100, y2: 100, score: 0.8, label: 'car' },
  ];
  assert.equal(nms(boxes, 0.45).length, 2);
});
