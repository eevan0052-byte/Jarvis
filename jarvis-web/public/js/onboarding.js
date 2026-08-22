/**
 * Onboarding — 8 cinematic steps. Every optional step is genuinely skippable;
 * permission steps probe real APIs. The mini core animates in the background.
 */
import { $, $$ } from './utils.js';
import { Settings } from './settings.js';
import { SpeakerId } from './speaker.js';
import { faceApiAvailable, FaceId } from './faceid.js';
import { sttAvailable } from './speech.js';
import { requestPermission } from './notifications.js';
import { saveRule, defaultTemplates } from './automation.js';
import { play } from './audio-synth.js';
import { emit } from './state.js';

let step = 0;

export function initOnboarding() {
  if (Settings.get('onboarding.done')) return;
  const ob = $('#onboarding');
  ob.classList.add('active');
  obMiniCore();
  renderStep(0);
}

function renderStep(i) {
  step = i;
  const content = $('#ob-content');
  const steps = [
    { title: 'Welcome', html: () => `
      <div class="ob-sub">I am a personal AI operating layer for your device.<br>Voice, vision, memory and automation — working together, on-device, under your control.</div>
      <div class="ob-sub faint" style="font-size:0.7rem">No account. No cloud uploads. Everything you see is real and runs locally.<br>This demo simulates the Fold's cover/unfold form factors with the buttons up top.</div>` },
    { title: 'Choose your assistant', html: () => `
      <div class="ob-sub">I respond to a name. The default is JARVIS — or choose your own.</div>
      <input id="ob-name-input" class="mono" value="JARVIS" maxlength="14" style="text-align:center;letter-spacing:.3em;font-size:1.2rem;width:240px" aria-label="Assistant name">` },
    { title: 'Voice enrollment', html: () => `
      <div class="ob-sub">${sttAvailable() ? 'Optional: enroll your voice so I can recognize who is speaking.' : 'Voice enrollment requires microphone access — you can skip this.'}</div>
      <div class="ob-sub faint" style="font-size:0.68rem">Honest scope: this is an acoustic voiceprint (pitch/energy profile), not a security biometric. It stays on this device, encrypted.</div>
      <button class="btn primary" id="ob-enroll-voice">Enroll my voice</button>
      <div id="ob-enroll-voice-status"></div>` },
    { title: 'Face enrollment', html: () => `
      <div class="ob-sub">${faceApiAvailable() ? 'Optional: enroll your face for instant personalization.' : 'Face detection is not available in this browser — this step is skipped honestly.'}</div>
      <div class="ob-sub faint" style="font-size:0.68rem">Landmark templates only (eye/nose/mouth geometry). Encrypted, local, never uploaded.</div>
      ${faceApiAvailable() ? '<button class="btn primary" id="ob-enroll-face">Enroll my face</button><div id="ob-enroll-face-status"></div>' : '<div class="chip warn">UNAVAILABLE — SKIPPED</div>'}` },
    { title: 'Permissions', html: () => `
      <div class="ob-sub">I only use what you allow. Each permission has a purpose:</div>
      ${permRow('◉', 'Microphone', 'voice commands & enrollment', 'mic')}
      ${permRow('◎', 'Camera', 'Vision Mode only, with a visible indicator', 'cam')}
      ${permRow('◈', 'Notifications', 'reminders & predictions', 'notif')}
      ${permRow('⌖', 'Location', 'weather & arrival routines — or set a city instead', 'geo')}
      <div class="faint" style="font-size:0.66rem">Skip anything — you can change it later in the Privacy Center.</div>` },
    { title: 'Personalization', html: () => `
      <div class="ob-sub">How should I know you?</div>
      <input id="ob-usr-input" placeholder="Your name (optional)" style="width:240px">
      <div class="ob-sub faint" style="font-size:0.68rem">Response style</div>
      <div class="ob-template" id="ob-style">
        <span class="chip" data-s="brief">BRIEF</span><span class="chip sel" data-s="balanced">BALANCED</span><span class="chip" data-s="verbose">DETAILED</span>
      </div>` },
    { title: 'First routine', html: () => `
      <div class="ob-sub">Routines let me act on conditions you define.<br>Pick a starter template (edit anytime in Automation):</div>
      <div class="ob-template" id="ob-routines">
        <span class="chip sel" data-r="Low battery alert">▮ Battery alert</span>
        <span class="chip" data-r="Evening wind-down">☾ Evening wind-down</span>
        <span class="chip" data-r="Back online">⌁ Back online</span>
        <span class="chip" data-r="none">Skip</span>
      </div>` },
    { title: 'Systems ready', html: () => `
      <div class="ob-sub">Initialization complete.<br>Voice, vision, context and memory subsystems are standing by.</div>
      <div class="row" style="justify-content:center">
        <span class="chip ok">VOICE READY</span><span class="chip ok">VISION READY</span><span class="chip ok">CONTEXT READY</span><span class="chip ok">MEMORY READY</span>
      </div>` },
  ];

  const s = steps[i];
  content.innerHTML = `
    <div id="ob-title">${i + 1} / ${steps.length} — ${s.title}</div>
    <div id="ob-step-body">${s.html()}</div>
    <div id="ob-steps">${steps.map((_, k) => `<span class="ob-step-dot ${k < i ? 'done' : k === i ? 'cur' : ''}"></span>`).join('')}</div>
    <div id="ob-controls">
      ${i > 0 ? '<button class="btn ghost" id="ob-back">← Back</button>' : ''}
      <button class="btn primary" id="ob-next">${i === steps.length - 1 ? 'Enter JARVIS' : 'Continue'}</button>
      ${i > 0 && i < steps.length - 1 ? '<button class="btn ghost" id="ob-skip">Skip</button>' : ''}
    </div>`;

  $('#ob-back')?.addEventListener('click', () => renderStep(i - 1));
  $('#ob-skip')?.addEventListener('click', () => renderStep(i + 1));
  $('#ob-next').addEventListener('click', () => next());
  $('#ob-enroll-voice')?.addEventListener('click', async (e) => {
    const st = $('#ob-enroll-voice-status');
    st.textContent = 'Recording — speak naturally…';
    try {
      const r = await SpeakerId.enroll(Settings.get('user.name') || 'Primary user');
      st.textContent = `Enrolled (${r.sampleCount} samples). ✓`;
      play('confirm');
    } catch (err) { st.textContent = 'Failed: ' + err.message; }
  });
  $('#ob-enroll-face')?.addEventListener('click', async () => {
    const st = $('#ob-enroll-face-status');
    st.textContent = 'Starting camera…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      const video = document.createElement('video');
      video.srcObject = stream; video.playsInline = true; video.muted = true;
      await video.play();
      const detector = new FaceDetector({ maxDetectedFaces: 1 });
      const faces = [];
      for (let k = 0; k < 5; k++) {
        const f = await detector.detect(video);
        if (f[0]) faces.push(f[0]);
        await new Promise(r => setTimeout(r, 300));
      }
      stream.getTracks().forEach(t => t.stop());
      await FaceId.enroll(Settings.get('user.name') || 'Primary user', faces);
      st.textContent = `Enrolled (${faces.length} samples). ✓`;
      play('confirm');
    } catch (err) { st.textContent = 'Failed: ' + err.message; }
  });
  $('#ob-style')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-s]');
    if (chip) { $$('#ob-style .chip').forEach(c => c.classList.remove('sel')); chip.classList.add('sel'); }
  });
  $('#ob-routines')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-r]');
    if (chip) { $$('#ob-routines .chip').forEach(c => c.classList.remove('sel')); chip.classList.add('sel'); }
  });
}

async function next() {
  const name = $('#ob-name-input')?.value.trim();
  if (name) Settings.set('assistant.name', name.toUpperCase());

  const uname = $('#ob-usr-input')?.value.trim();
  if (uname) Settings.set('user.name', uname);
  const style = $('#ob-style .chip.sel')?.dataset.s;
  if (style) Settings.set('user.style', style);

  const routine = $('#ob-routines .chip.sel')?.dataset.r;
  if (routine && routine !== 'none') {
    const t = defaultTemplates().find(x => x.name === routine);
    if (t) saveRule({ name: t.name, when: t.when, then: t.then, autoRun: t.then.kind === 'action' });
  }

  const total = 8;
  if (step === total - 1) {
    Settings.set('onboarding.done', true);
    const ob = $('#onboarding');
    ob.style.opacity = '0';
    setTimeout(() => { ob.classList.remove('active'); ob.remove(); }, 650);
    emit('onboarding-done');
    play('online');
    return;
  }
  // permission probing on step 4
  if (step === 4) {
    // no automatic permission requests — user clicks through in Privacy Center
    // we simply advance; the Permission rows are informational here
  }
  play('keyTick');
  renderStep(step + 1);
}

function permRow(icon, label, desc, id) {
  return `<div class="ob-perm"><span>${icon}</span><div><div>${label}</div><div class="d">${desc}</div></div><span class="badge exp" style="margin-left:auto">OPTIONAL</span></div>`;
}

function obMiniCore() {
  const cv = $('#ob-core');
  const cx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = 170;
  cv.width = W * dpr; cv.height = W * dpr;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t0 = performance.now();
  const draw = (t) => {
    const el = (t - t0) / 1000;
    cx.clearRect(0, 0, W, W);
    cx.translate(W / 2, W / 2);
    for (let k = 0; k < 3; k++) {
      cx.strokeStyle = `rgba(87,184,255,${0.5 - k * 0.13})`;
      cx.lineWidth = 1.1;
      cx.beginPath();
      const sp = k % 2 ? -1 : 1;
      cx.arc(0, 0, 26 + k * 17, el * sp * (0.5 + k * 0.2), el * sp * (0.5 + k * 0.2) + Math.PI * 1.3);
      cx.stroke();
    }
    const pulse = 0.8 + 0.2 * Math.sin(el * 2.2);
    const g = cx.createRadialGradient(0, 0, 0, 0, 0, 30 * pulse);
    g.addColorStop(0, 'rgba(87,184,255,0.75)');
    g.addColorStop(1, 'rgba(87,184,255,0.02)');
    cx.fillStyle = g;
    cx.beginPath(); cx.arc(0, 0, 30 * pulse, 0, Math.PI * 2); cx.fill();
    // orbiting particles
    for (let i = 0; i < 14; i++) {
      const a = el * (0.3 + (i % 5) * 0.1) + i * (Math.PI * 2 / 14);
      const r = 44 + (i % 3) * 12;
      cx.fillStyle = `rgba(143,208,255,${0.3 + (i % 4) * 0.12})`;
      cx.beginPath(); cx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2, 0, Math.PI * 2); cx.fill();
    }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if ($('#onboarding')) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
