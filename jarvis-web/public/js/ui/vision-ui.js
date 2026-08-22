/** Vision Mode UI — camera overlay, scan HUD, boxes, OCR, identify, remember. */
import { $, $$ } from './../utils.js';
import { State, on, emit } from './../state.js';
import { startCamera, stopCamera, startDetectionLoop, stopDetectionLoop, detectFaces, analyzeScene, ocrFrame, initFaceDetector } from './../vision.js';
import { Settings } from './../settings.js';
import { play } from './../audio-synth.js';
import { haptic } from './../notifications.js';
import { processCommand } from './../assistant.js';
import { Memory } from './../memory.js';
import { Privacy } from './../privacy.js';
import { FaceId } from './../faceid.js';
import { toast } from './../utils.js';

let faceLoop = null;
let sceneLoop = null;
let gestureTimer = null;
let gestureHoldStart = 0;
let lastLabel = '';

export function initVision() {
  const ov = $('#vision-overlay');
  const video = $('#vision-video');

  on('open-vision', async () => {
    if (State.get('vision').cameraOn) return;
    ov.classList.add('open');
    $('#vision-status').textContent = 'starting camera…';
    try {
      await startCamera(video);
      State.setMode('VISION');
      $('#vision-status').textContent = State.get('vision').modelReady ? 'model ready — analyzing' : 'model unavailable — scene analysis only';
      if (!State.get('vision').modelReady) {
        toast('Vision model unavailable. Local scene analysis remains available.', 'warn');
      }
      startDetectionLoop();
      initFaceDetector();
      faceLoop = setInterval(() => detectFaces(video).then(faces => {
        State.patch({ vision: { ...State.get('vision'), faces } });
        emit('faces', faces);
        renderBoxes();
        maybeMatchFaces(faces);
      }).catch(() => {}), 1200);
      sceneLoop = setInterval(() => {
        const scene = analyzeScene(video);
        State.patch({ vision: { ...State.get('vision'), scene } });
        renderMetrics(scene);
        gestureCheck(scene);
      }, 1000);
      Privacy.log('vision-activated');
    } catch (e) {
      $('#vision-status').textContent = 'camera unavailable: ' + e.message;
      toast('Camera unavailable. ' + e.message, 'err');
      setTimeout(() => closeVision(), 2500);
    }
  });

  on('detections', renderBoxes);

  const closeVision = () => {
    stopCamera();
    clearInterval(faceLoop); clearInterval(sceneLoop); faceLoop = sceneLoop = null;
    ov.classList.remove('open');
    $('#vision-hud').querySelectorAll('.vbox').forEach(b => b.remove());
    $('#vision-feed').innerHTML = '';
    if (State.get('mode') === 'VISION') State.setMode('IDLE');
    Privacy.log('vision-deactivated');
  };
  $('#vis-close').addEventListener('click', closeVision);
  on('vision-close', closeVision);

  // ── actions ──
  $('#vis-analyze').addEventListener('click', () => {
    if (!State.get('vision').cameraOn) return;
    play('scan'); haptic('scanDone');
    const scene = State.get('vision').scene;
    const dets = State.get('vision').detections || [];
    const summary = dets.length
      ? `I can see: ${dets.slice(0, 6).map(d => `${d.label} (${Math.round(d.score * 100)}%)`).join(', ')}.`
      : 'No distinct objects detected in frame yet.';
    addVisionLine(summary + (scene ? ` Lighting is ${scene.brightness}, dominant tones ${(scene.colors || []).slice(0, 2).join(', ')}.` : ''));
    emit('vision-announce', summary);
  });

  $('#vis-identify').addEventListener('click', async () => {
    const top = State.get('vision').detections?.[0];
    if (!top) { addVisionLine('No object detected yet — hold steady.'); return; }
    addVisionLine(`Top detection: ${top.label} (${Math.round(top.score * 100)}%). Looking it up…`);
    await lookupObject(top.label);
  });

  $('#vis-ocr').addEventListener('click', async () => {
    if (!State.get('vision').cameraOn) return;
    $('#vision-status').textContent = 'OCR running (on-device)…';
    try {
      const text = await ocrFrame(video, (p, m) => { $('#vision-status').textContent = `OCR: ${m} ${Math.round(p)}%`; });
      State.patch({ vision: { ...State.get('vision'), textLines: text ? [text] : [] } });
      if (text) {
        $('#vision-feed').innerHTML = `<div class="glass-title" style="padding-left:10px">OCR Result</div><div class="ocr-box">${esc(text.slice(0, 800))}</div>`;
        emit('vision-announce', `I read: "${text.slice(0, 200)}"`);
      } else {
        addVisionLine('No text detected in frame.');
        $('#vision-status').textContent = 'no text found';
      }
      play('scanComplete');
    } catch (e) {
      addVisionLine('OCR engine unavailable: ' + e.message);
      $('#vision-status').textContent = 'OCR failed';
    }
  });

  $('#vis-remember').addEventListener('click', () => {
    const top = State.get('vision').detections?.[0];
    if (!top) { addVisionLine('No object detected to remember.'); return; }
    const existing = Memory.all('object').filter(o => (o.tags || []).includes(top.label));
    Memory.add({ category: 'object', title: top.label, body: `Remembered ${new Date().toLocaleString()} — ${Math.round(top.score * 100)}% confidence${existing.length ? ` · seen ${existing.length} time(s) before` : ''}`, tags: ['object', top.label], data: { label: top.label, lastSeen: Date.now() } });
    addVisionLine(`"${top.label}" committed to Object Memory (${existing.length} prior sighting(s)).`);
    play('confirm');
  });

  $('#vis-ocr').addEventListener('dblclick', () => {});
}

async function lookupObject(label) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(label)}`);
    if (!res.ok) throw new Error('no article');
    const data = await res.json();
    const extract = (data.extract || '').slice(0, 400);
    if (extract) {
      addVisionLine(`<b>${esc(data.title || label)}</b> — ${esc(extract)}`, true);
      emit('vision-announce', `${label}: ${extract.slice(0, 220)}`);
      play('confirm');
      return;
    }
    throw new Error('empty');
  } catch {
    addVisionLine(`No online knowledge found for "${label}" (offline or no article). Object Memory may have notes.`);
  }
}

function renderBoxes() {
  const hud = $('#vision-hud');
  const v = State.get('vision');
  hud.querySelectorAll('.vbox').forEach(b => b.remove());
  const video = $('#vision-video');
  const scaleX = video.clientWidth / (video.videoWidth || 1280);
  const scaleY = video.clientHeight / (video.videoHeight || 720);
  if (Settings.get('vision.boxes') !== false) {
    for (const d of (v.detections || []).slice(0, 8)) {
      const el = document.createElement('div');
      el.className = 'vbox';
      el.style.left = d.x * scaleX + 'px';
      el.style.top = d.y * scaleY + 'px';
      el.style.width = d.w * scaleX + 'px';
      el.style.height = d.h * scaleY + 'px';
      el.innerHTML = `<span class="vlabel">${esc(d.label)} · ${Math.round(d.score * 100)}%</span>`;
      hud.appendChild(el);
    }
  }
  for (const f of (v.faces || [])) {
    const el = document.createElement('div');
    el.className = 'vbox face';
    el.style.left = f.x * scaleX + 'px';
    el.style.top = f.y * scaleY + 'px';
    el.style.width = f.w * scaleX + 'px';
    el.style.height = f.h * scaleY + 'px';
    el.innerHTML = `<span class="vlabel">FACE · ${f.landmarks} landmarks</span>`;
    hud.appendChild(el);
  }

  // feed panel
  const feed = $('#vision-feed');
  const dets = (v.detections || []).slice(0, 8);
  feed.innerHTML = dets.length
    ? dets.map(d => `<div class="det-item">▣ ${esc(d.label)}<span class="pct">${Math.round(d.score * 100)}%</span><button class="lookup" data-l="${esc(d.label)}">ⓘ</button></div>`).join('')
    : '<div class="faint" style="padding:6px">Scanning… no confident detections yet.</div>';
  $$('#vision-feed .lookup').forEach(b => b.addEventListener('click', () => lookupObject(b.dataset.l)));
}

function renderMetrics(scene) {
  if (!scene) return;
  $('#vision-metrics').innerHTML = `
    <span class="chip">LIGHT ${scene.brightness.toUpperCase()}</span>
    <span class="chip">TONE ${(scene.colors || []).slice(0, 2).join('/').toUpperCase() || '—'}</span>
    <span class="chip">MOTION ${Math.round(scene.motion * 100)}%</span>
    <span class="chip">EDGE ${Math.round(scene.edgeDensity * 100)}%</span>`;
}

/* Experimental gesture: palm-hold (stationary skin-tone dominant region) → pause TTS/detection briefly */
function gestureCheck(scene) {
  if (!Settings.get('vision.gestures')) return;
  const still = scene.motion < 0.04;
  const warm = (scene.colors || []).includes('orange') || (scene.colors || []).includes('pink');
  if (still && warm) {
    if (!gestureHoldStart) gestureHoldStart = Date.now();
    if (Date.now() - gestureHoldStart > 2000) {
      gestureHoldStart = 0;
      toast('Gesture (experimental): open hand detected — pausing output for 10s.', 'ok');
      import('./../speech.js').then(({ stopSpeaking }) => stopSpeaking());
    }
  } else gestureHoldStart = 0;
}

/* Face matching against enrolled profiles (explicit enrollment only) */
async function maybeMatchFaces(faces) {
  if (!faces.length) return;
  const { profiles } = FaceId;
  if (!profiles().length) return;
  try {
    const res = await FaceId.verify(faces);
    if (res.match && !res.match.lowConfidence) {
      emit('face-match', res.match);
    }
  } catch { /* ignore */ }
}

function addVisionLine(html, allowHtml = false) {
  const feed = $('#vision-feed');
  const el = document.createElement('div');
  el.className = 'ocr-box';
  el.style.marginTop = '8px';
  if (allowHtml) el.innerHTML = html; else el.textContent = html;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
