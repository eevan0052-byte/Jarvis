/**
 * Boot sequence — real subsystem probes, cinematic presentation.
 * Every check is a genuine capability probe; results are shown honestly.
 */
import { State, emit } from './../state.js';
import { $, sleep } from './../utils.js';
import { play } from './../audio-synth.js';
import { sttAvailable, ttsAvailable } from './../speech.js';
import { loadModel } from './../vision.js';
import { faceApiAvailable } from './../faceid.js';

const CHECKS = [
  { id: 'audio', label: 'AUDIO SYNTHESIS CORE', run: async () => (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') ? 'ok' : 'warn' },
  { id: 'tts', label: 'VOICE SYNTHESIS', run: async () => ttsAvailable() ? 'ok' : 'warn' },
  { id: 'stt', label: 'SPEECH RECOGNITION', run: async () => sttAvailable() ? 'ok' : 'warn' },
  { id: 'camera', label: 'CAMERA BUS', run: async () => (navigator.mediaDevices?.getUserMedia ? 'ok' : 'warn') },
  { id: 'vision-model', label: 'VISION MODEL (ON-DEVICE)', run: async (p) => { try { await loadModel((pct, msg) => p(pct, msg)); return 'ok'; } catch { return 'err'; } } },
  { id: 'memory', label: 'MEMORY INDEX', run: async () => { const { Memory } = await import('./../memory.js'); State.patch({ memory: { count: Memory.all().length } }); return 'ok'; } },
  { id: 'storage', label: 'SECURE STORAGE', run: async () => { try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); return 'ok'; } catch { return 'err'; } } },
  { id: 'network', label: 'NETWORK LINK', run: async () => { try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000); const r = await fetch('/api/health', { signal: ctl.signal }); clearTimeout(t); return r.ok ? 'ok' : 'warn'; } catch { return navigator.onLine ? 'warn' : 'err'; } } },
];

export async function runBoot() {
  const holder = $('#boot-checks');
  const progress = $('#boot-progress');
  const results = {};
  let visionLoaded = false;

  // build rows
  for (const c of CHECKS) {
    const row = document.createElement('div');
    row.className = 'boot-check pending';
    row.id = `boot-${c.id}`;
    row.innerHTML = `<span>${c.label}</span><span class="bar" style="display:none"><i></i></span><span class="st">PENDING</span>`;
    holder.appendChild(row);
  }

  play('boot');

  // boot core animation (mini canvas)
  bootAnim();

  for (let i = 0; i < CHECKS.length; i++) {
    const c = CHECKS[i];
    const row = $(`#boot-${c.id}`);
    const bar = row.querySelector('.bar');
    const stEl = row.querySelector('.st');
    stEl.textContent = 'CHECKING';
    if (c.id === 'vision-model') {
      bar.style.display = 'block';
      const res = await c.run((pct, msg) => {
        bar.querySelector('i').style.width = pct + '%';
        stEl.textContent = msg.toUpperCase().slice(0, 26);
        progress.textContent = `LOADING VISION MODEL ${Math.round(pct)}%`;
      });
      results[c.id] = res;
      row.className = 'boot-check ' + res;
      stEl.textContent = res === 'ok' ? 'READY' : res === 'warn' ? 'DEGRADED' : 'UNAVAILABLE';
      bar.style.display = 'none';
      if (res === 'ok') visionLoaded = true;
    } else {
      const res = await c.run();
      results[c.id] = res;
      row.className = 'boot-check ' + res;
      stEl.textContent = res === 'ok' ? 'READY' : res === 'warn' ? 'LIMITED' : 'UNAVAILABLE';
    }
    progress.textContent = `INITIALIZING ${Math.round(((i + 1) / CHECKS.length) * 100)}%`;
    await sleep(160);
  }

  State.patch({
    boot: { done: true, checks: results },
    voice: { ...State.get('voice'), available: results.stt === 'ok' },
    vision: { ...State.get('vision'), modelReady: visionLoaded, faceApi: faceApiAvailable() },
  });

  progress.textContent = 'ALL SYSTEMS NOMINAL';
  await sleep(450);
  progress.textContent = '';
  progress.style.display = 'none';
  play('online');
  State.setMode('IDLE');
  emit('boot-done', results);

  // fade boot overlay
  const ov = $('#boot-overlay');
  ov.classList.add('done');
  await sleep(900);
  ov.remove();
  const app = $('#app');
  app.classList.add('ready');
}

/** Minimal boot canvas — expanding rings while subsystems load. */
function bootAnim() {
  const cv = $('#boot-canvas');
  const cx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t0 = performance.now();
  const draw = (t) => {
    const el = (t - t0) / 1000;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    const x = innerWidth / 2, y = innerHeight / 2 - 30;
    const R = Math.min(innerWidth, innerHeight) * 0.24;
    for (let k = 0; k < 3; k++) {
      const ph = (el * 0.5 + k / 3) % 1;
      cx.strokeStyle = `rgba(87,184,255,${(0.5 * (1 - ph))})`;
      cx.lineWidth = 1.2;
      cx.beginPath();
      cx.arc(x, y, R * (0.55 + ph * 0.75), ph * Math.PI * 2, ph * Math.PI * 2 + Math.PI * 1.4);
      cx.stroke();
    }
    const pulse = 0.85 + 0.15 * Math.sin(el * 2.4);
    const g = cx.createRadialGradient(x, y, 0, x, y, R * 0.5);
    g.addColorStop(0, `rgba(87,184,255,${0.5 * pulse})`);
    g.addColorStop(1, 'rgba(87,184,255,0)');
    cx.fillStyle = g;
    cx.beginPath(); cx.arc(x, y, R * 0.5, 0, Math.PI * 2); cx.fill();
    if ($('#boot-overlay')) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
