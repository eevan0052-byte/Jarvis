/** Privacy Center UI — live permission states, biometrics, audit, wipe. */
import { $, esc } from './../utils.js';
import { Privacy, realPermissionState, permLabel } from './../privacy.js';
import { Settings } from './../settings.js';
import { SpeakerId } from './../speaker.js';
import { FaceId, faceApiAvailable } from './../faceid.js';
import { Vault } from './../secrets.js';
import { requestPermission } from './../notifications.js';
import { emit } from './../state.js';

export async function renderPrivacy() {
  const body = $('#privacy-body');
  body.innerHTML = '<div class="dim">Loading permission states…</div>';

  const capRows = await Promise.all(Privacy.capabilities().map(async (c) => {
    const state = c.needsPerm ? await realPermissionState(c.needsPerm) : 'n/a';
    return { ...c, state };
  }));

  const speakers = SpeakerId.profiles();
  const faces = FaceId.profiles();

  body.innerHTML = `
    <div class="row spread" style="margin-bottom:14px">
      <span class="tiny dim">WHAT JARVIS CAN ACCESS — YOU STAY IN CONTROL</span>
      <span class="badge real">${navigator.userAgent.includes('Android') ? 'BROWSER COMPANION' : 'WEB BUILD'} · DATA STAYS ON DEVICE</span>
    </div>
    ${capRows.map(c => `
      <div class="cap-row">
        <div class="ico">${c.icon}</div>
        <div class="inf">
          <div class="lbl">${c.label} ${c.biometric ? '<span class="badge exp">EXPERIMENTAL · LOCAL</span>' : ''}${c.external ? '<span class="badge unavail">OPTIONAL · CLOUD</span>' : ''}</div>
          <div class="desc">${c.desc}</div>
        </div>
        <div class="ctrls">
          ${c.needsPerm ? `<span class="badge ${c.state === 'granted' ? 'real' : c.state === 'denied' ? 'unavail' : 'exp'}">${permLabel(c.state)}</span>` : ''}
          ${c.biometric ? `<button class="btn" data-bio="${c.id}">Manage</button>` : ''}
          ${c.needsPerm && c.state !== 'granted' ? `<button class="btn" data-perm="${c.needsPerm}">Grant</button>` : ''}
        </div>
      </div>`).join('')}

    <div class="glass-title" style="padding-left:0">Biometric profiles</div>
    <div class="glass-body" style="padding-left:0">
      <div class="kv"><span class="k">Voice profiles</span><span class="v">${speakers.length ? speakers.map(s => s.name).join(', ') : 'none enrolled'}</span></div>
      <div class="kv"><span class="k">Face profiles</span><span class="v">${faces.length ? faces.map(s => s.name).join(', ') : faceApiAvailable() ? 'none enrolled' : 'unavailable (no FaceDetector API)'}</span></div>
      <div class="kv"><span class="k">Secret vault</span><span class="v">${Vault.persistent ? (Vault.unlocked ? 'unlocked' : 'locked (PIN protected)') : 'session-only keys'}</span></div>
    </div>

    <div class="glass-title" style="padding-left:0">Activity audit (local)</div>
    <div id="audit-log">${Privacy.audit().slice(0, 60).map(a => `<div><span class="ev">[${new Date(a.ts).toLocaleTimeString()}] ${a.event}</span> ${esc(a.detail)}</div>`).join('') || '<div class="faint">No recorded activity.</div>'}</div>

    <div class="row wrap" style="margin-top:16px">
      <button class="btn danger" id="prv-wipe">Delete all local data</button>
      <button class="btn" id="prv-clear-audit">Clear audit log</button>
      <button class="btn" id="prv-export">Export my data</button>
      <button class="btn" id="prv-notif">Enable notifications</button>
    </div>
    <div class="faint tiny" style="margin-top:12px;line-height:1.7">
      Transparency: audio is processed during voice commands and never recorded to disk. Camera frames are analyzed in-browser and discarded; nothing is uploaded. Biometric templates are encrypted at rest and only leave this device if you explicitly export your data. No analytics SDK, no tracking, no accounts.
    </div>`;

  $$('#privacy-body [data-perm]').forEach(b => b.addEventListener('click', async () => {
    const name = b.dataset.perm;
    if (name === 'notifications') { await requestPermission(); }
    else {
      try { await navigator.mediaDevices.getUserMedia({ [name]: true }); }
      catch { /* denied — state shows honestly */ }
    }
    renderPrivacy();
  }));

  $$('#privacy-body [data-bio]').forEach(b => b.addEventListener('click', () => renderBioManager(b.dataset.bio)));

  $('#prv-clear-audit').addEventListener('click', () => { Privacy.clearAudit(); renderPrivacy(); });
  $('#prv-notif').addEventListener('click', async () => { await requestPermission(); renderPrivacy(); });
  $('#prv-export').addEventListener('click', async () => {
    const data = await Privacy.exportAll();
    const { download } = await import('./../utils.js');
    download('jarvis-data-export.json', JSON.stringify(data, null, 2));
  });
  $('#prv-wipe').addEventListener('click', async () => {
    if (!confirm('Delete ALL local data — memories, profiles, keys, settings? This cannot be undone.')) return;
    await Privacy.wipeAllData();
    renderPrivacy();
  });
}

function renderBioManager(kind) {
  const body = $('#privacy-body');
  if (kind === 'speaker') {
    const profiles = SpeakerId.profiles();
    body.innerHTML = `
      <div class="sheet-head" style="border:none;padding:0 0 12px"><h2>∿ Voice profiles</h2></div>
      <div class="dim" style="margin-bottom:12px">
        <b>Honest scope:</b> browsers expose no biometric speaker-embedding API. JARVIS extracts an acoustic voiceprint (pitch, spectral centroid, energy contour) from a local recording — it distinguishes clearly different voices, but it is <b>not</b> a security-grade biometric. Never transmitted; encrypted at rest.
      </div>
      ${profiles.map(p => `<div class="kv"><span class="k">${esc(p.name)}</span><span class="v row"><span class="faint">${p.sampleCount} samples</span><button class="btn danger" data-del="${esc(p.name)}">Delete</button></span></div>`).join('') || '<div class="dim">No profiles.</div>'}
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="bio-enroll">Enroll voice (speak 2 samples)</button>
        <button class="btn" id="bio-verify">Verify current speaker</button>
        <button class="btn ghost" id="bio-back">← Back</button>
      </div>
      <div class="tiny faint" id="bio-status" style="margin-top:10px"></div>`;
    $('#bio-back').addEventListener('click', renderPrivacy);
    $('#bio-enroll').addEventListener('click', async () => {
      const st = $('#bio-status');
      st.textContent = 'Recording sample 1 — speak naturally for 3 seconds…';
      try {
        const res = await SpeakerId.enroll('Primary user');
        st.textContent = `Enrolled "${res.name}" with ${res.sampleCount} samples.`;
      } catch (e) { st.textContent = 'Enrollment failed: ' + e.message; }
      renderBioManager('speaker');
    });
    $('#bio-verify').addEventListener('click', async () => {
      const st = $('#bio-status');
      st.textContent = 'Listening for 3 seconds…';
      const r = await SpeakerId.verify();
      st.textContent = r.match
        ? (r.match.lowConfidence ? 'Possible (low confidence): ' : 'Voice matches: ') + r.match.name + ` (${r.match.score}%)`
        : 'No voice profile matched.';
    });
    $$('#privacy-body [data-del]').forEach(b => b.addEventListener('click', () => { SpeakerId.remove(b.dataset.del); renderBioManager('speaker'); }));
  } else {
    const profiles = FaceId.profiles();
    const ok = faceApiAvailable();
    body.innerHTML = `
      <div class="sheet-head" style="border:none;padding:0 0 12px"><h2>◉ Face profiles</h2></div>
      <div class="dim" style="margin-bottom:12px">
        <b>Honest scope:</b> ${ok ? 'Using the platform FaceDetector API, JARVIS stores landmark-geometry templates (relative eye/nose/mouth positions) for personalization — not for security. Never uploaded; encrypted at rest.' : '<b>Face detection is not available in this browser</b> (the FaceDetector API is not exposed). Enrollment is disabled rather than faked. On Android, ML Kit provides full face detection.'}
      </div>
      ${profiles.map(p => `<div class="kv"><span class="k">${esc(p.name)}</span><span class="v row"><span class="faint">${p.samples} samples</span><button class="btn danger" data-fdel="${esc(p.name)}">Delete</button></span></div>`).join('') || '<div class="dim">No profiles.</div>'}
      <div class="row" style="margin-top:14px">
        ${ok ? '<button class="btn primary" id="face-enroll">Enroll via camera</button>' : ''}
        <button class="btn ghost" id="bio-back">← Back</button>
      </div>
      <div class="tiny faint" id="bio-status" style="margin-top:10px"></div>
      ${ok ? '<video id="face-feed" playsinline muted style="width:280px;border-radius:8px;border:1px solid rgba(110,180,255,.3);margin-top:10px"></video>' : ''}`;
    $('#bio-back').addEventListener('click', renderPrivacy);
    $('#face-enroll')?.addEventListener('click', () => enrollFace());
    $$('#privacy-body [data-fdel]').forEach(b => b.addEventListener('click', async () => { await FaceId.remove(b.dataset.fdel); renderBioManager('face'); }));
  }
}

async function enrollFace() {
  const st = $('#bio-status');
  const video = $('#face-feed');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();
    st.textContent = 'Capturing 5 face samples — look at the camera…';
    const detector = new FaceDetector({ fastMode: false, maxDetectedFaces: 1 });
    const faces = [];
    for (let i = 0; i < 5; i++) {
      const detected = await detector.detect(video);
      if (detected[0]) faces.push(detected[0]);
      await new Promise(r => setTimeout(r, 350));
    }
    stream.getTracks().forEach(t => t.stop());
    await FaceId.enroll('Primary user', faces);
    st.textContent = `Enrolled (${faces.length} samples).`;
  } catch (e) {
    st.textContent = 'Enrollment failed: ' + e.message;
  }
  renderBioManager('face');
}
