/** Settings UI — voice, AI providers, environment, a11y, sound, data. */
import { $, $$, esc } from './../utils.js';
import { Settings, applyA11yClasses } from './../settings.js';
import { State, emit } from './../state.js';
import { listVoices, ttsAvailable, initVoices } from './../speech.js';
import { listProviders, setActiveProvider } from './../providers/index.js';
import { Vault } from './../secrets.js';
import { geocodeCity, useGeolocation, reverseLabel, refreshWeather } from './../weather.js';
import { refreshWeather as wx } from './../weather.js';
import { Memory } from './../memory.js';
import { toast } from './../utils.js';

let tab = 'voice';

export function renderSettings() {
  const body = $('#settings-body');
  initVoices();
  const s = Settings.all();
  const voices = listVoices();

  body.innerHTML = `
    <div id="settings-tabs">
      ${[['voice', 'Voice'], ['ai', 'AI Engine'], ['env', 'Environment'], ['fx', 'Display & Sound'], ['a11y', 'Accessibility'], ['data', 'Data']].map(([id, l]) =>
        `<button class="stab ${tab === id ? 'sel' : ''}" data-tab="${id}">${l}</button>`).join('')}
    </div>
    <div id="settings-content" style="margin-top:14px"></div>`;

  $$('#settings-tabs .stab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderSettings(); }));

  const content = $('#settings-content');
  const rows = (html) => content.innerHTML = html.join('');

  if (tab === 'voice') {
    rows([
      setRow('Speech recognition', sttDesc(), ''),
      setRow('Voice output', `${ttsAvailable() ? 'Available' : 'Unavailable in this browser'}`, switchHtml('voice.ttsEnabled', s.voice.ttsEnabled)),
      setRow('Wake word "Jarvis"', 'Continuously listens for "Jarvis" (uses the platform recognizer — battery cost, requires mic permission). Disabled by default.', switchHtml('voice.wakeWord', s.voice.wakeWord)),
      setRow('Speaking rate', '', `<input type="range" min="0.7" max="1.5" step="0.02" data-set="voice.ttsRate" value="${s.voice.ttsRate}">`),
      setRow('Voice pitch', '', `<input type="range" min="0.6" max="1.4" step="0.02" data-set="voice.ttsPitch" value="${s.voice.ttsPitch}">`),
      setRow('Voice volume', '', `<input type="range" min="0" max="1" step="0.05" data-set="voice.volume" value="${s.voice.volume}">`),
      setRow('TTS voice', 'Choose the synthesis voice', `<select data-set="voice.voiceURI">${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voice.voiceURI ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('') || '<option>no voices</option>'}</select>`),
      setRow('Response style', '', `<select data-set="user.style">${['brief', 'balanced', 'verbose'].map(o => `<option ${s.user.style === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`),
    ]);
  }

  if (tab === 'ai') {
    const providers = listProviders();
    rows([
      `<p class="dim" style="margin-bottom:12px;font-size:0.74rem;line-height:1.6">
        The local engine runs fully on-device with zero configuration. For open-ended questions, connect a cloud engine with your own API key — it is encrypted at rest (AES-256-GCM vault) and only sent to the provider you choose. Nothing is ever hard-coded.</p>`,
      `<div id="providers-grid">${providers.map(p => `
        <div class="provider-card ${s.provider.id === p.id ? 'sel' : ''}">
          <div class="name">${p.id === 'local' ? '◈' : '☁'} ${p.label} <span class="badge ${p.kind === 'local' ? 'real' : p.configured ? 'real' : 'unavail'}">${p.kind === 'local' ? 'ON-DEVICE' : p.configured ? 'CONFIGURED' : 'NO KEY'}</span></div>
          <button class="btn ${s.provider.id === p.id ? 'primary' : ''}" data-use="${p.id}" ${p.kind === 'cloud' && !p.configured ? 'disabled title="Add a key first"' : ''}>${s.provider.id === p.id ? '● Active' : 'Use engine'}</button>
          ${p.kind === 'cloud' ? `
            <input type="password" placeholder="API key (encrypted at rest)" data-key="${p.id}">
            <input type="text" placeholder="Endpoint (default ${p.id === 'openai' ? 'api.openai.com/v1' : p.id === 'anthropic' ? 'api.anthropic.com/v1' : 'generativelanguage.googleapis.com/v1beta'})" data-base="${p.id}" value="${esc(s.providers[p.id]?.baseUrl || '')}">
            <input type="text" placeholder="Model (default ${s.providers[p.id]?.model || ''})" data-model="${p.id}" value="${esc(s.providers[p.id]?.model || '')}">
            <div class="row" style="margin-top:6px">
              <button class="btn" data-save="${p.id}">Save config</button>
              <button class="btn danger" data-forget="${p.id}" ${p.configured ? '' : 'disabled'}>Forget key</button>
            </div>` : ''}
        </div>`).join('')}</div>`,
      `<div class="kv" style="margin-top:14px"><span class="k">Secret vault</span><span class="v">${Vault.persistent ? (Vault.unlocked ? 'Unlocked (keys survive reload)' : 'Locked — enter PIN') : 'Not set up — keys are session-only'}</span></div>`,
      `<div class="row" style="margin-top:8px"><input type="password" id="vault-pin" placeholder="Set / enter vault PIN" style="flex:1"><button class="btn" id="vault-set">Set PIN</button><button class="btn" id="vault-unlock">Unlock</button><button class="btn danger" id="vault-destroy">Destroy vault</button></div>`,
    ]);

    $$('#settings-content [data-use]').forEach(b => b.addEventListener('click', () => { setActiveProvider(b.dataset.use); renderSettings(); }));
    $$('#settings-content [data-save]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.save;
      const key = $(`#settings-content [data-key="${id}"]`).value.trim();
      const base = $(`#settings-content [data-base="${id}"]`).value.trim();
      const model = $(`#settings-content [data-model="${id}"]`).value.trim();
      if (key) {
        if (!Vault.unlocked) { Vault.setSessionKey(id, key); }
        else await Vault.putKey(id, key);
        Settings.set(`providers.${id}.keySet`, true);
        window.__vaultState = { unlocked: Vault.unlocked };
        toast('Key stored — encrypted at rest.', 'ok');
      }
      if (base) Settings.set(`providers.${id}.baseUrl`, base);
      if (model) Settings.set(`providers.${id}.model`, model);
      renderSettings();
    }));
    $$('#settings-content [data-forget]').forEach(b => b.addEventListener('click', async () => {
      await Vault.removeKey(b.dataset.forget);
      Settings.set(`providers.${b.dataset.forget}.keySet`, false);
      if (Settings.get('provider.id') === b.dataset.forget) setActiveProvider('local');
      renderSettings();
    }));
    $('#vault-set').addEventListener('click', async () => {
      try { await Vault.setup($('#vault-pin').value); toast('Vault created — provider keys now survive reloads encrypted.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      renderSettings();
    });
    $('#vault-unlock').addEventListener('click', async () => {
      try { await Vault.unlock($('#vault-pin').value); toast('Vault unlocked.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      renderSettings();
    });
    $('#vault-destroy').addEventListener('click', async () => { await Vault.destroy(); toast('Vault destroyed.', 'warn'); renderSettings(); });
  }

  if (tab === 'env') {
    const w = s.weather;
    rows([
      setRow('Location source', w.city ? `Manual city: ${w.city}` : w.lat ? 'Geolocation (granted)' : 'Not configured', ''),
      `<div class="row" style="margin-top:8px"><input id="env-city" placeholder="City name (e.g. Lille)" style="flex:1"><button class="btn" id="env-city-save">Set city</button><button class="btn" id="env-geo">Use my location</button><button class="btn" id="env-refresh">Refresh weather</button></div>`,
      setRow('Units', '', `<select data-set="units"><option ${s.units === 'metric' ? 'selected' : ''}>metric</option><option ${s.units === 'imperial' ? 'selected' : ''}>imperial</option></select>`),
      `<div class="faint tiny" style="margin-top:10px">Weather: Open-Meteo (no API key, no tracking). Location is used only for weather and arrival routines and is never stored beyond this device.</div>`,
    ]);
    $('#env-city-save').addEventListener('click', async () => {
      try {
        const g = await geocodeCity($('#env-city').value);
        Settings.set('weather.city', g.city); Settings.set('weather.lat', g.lat); Settings.set('weather.lon', g.lon);
        State.patch({ location: { lat: g.lat, lon: g.lon, label: g.city } });
        await refreshWeather({ force: true });
        toast(`Weather configured for ${g.city}`, 'ok');
      } catch (e) { toast(e.message, 'err'); }
      renderSettings();
    });
    $('#env-geo').addEventListener('click', async () => {
      try {
        const g = await useGeolocation();
        const label = await reverseLabel(g.lat, g.lon);
        Settings.set('weather.lat', g.lat); Settings.set('weather.lon', g.lon);
        if (label) Settings.set('weather.city', label);
        State.patch({ location: { lat: g.lat, lon: g.lon, label: label || 'current location' } });
        await refreshWeather({ force: true });
        toast('Location saved for weather.', 'ok');
      } catch (e) { toast('Location denied: ' + e.message, 'err'); }
      renderSettings();
    });
    $('#env-refresh').addEventListener('click', async () => {
      try { await refreshWeather({ force: true }); toast('Weather refreshed.', 'ok'); }
      catch { toast('Weather service unreachable.', 'err'); }
    });
  }

  if (tab === 'fx') {
    rows([
      setRow('Sound effects', 'Synthesized in-browser, subtle by design', switchHtml('sounds.enabled', s.sounds.enabled)),
      setRow('Sound volume', '', `<input type="range" min="0" max="1" step="0.05" data-set="sounds.volume" value="${s.sounds.volume}">`),
      setRow('Haptic feedback', 'Vibration on listen / confirm / error', switchHtml('a11y.haptics', s.a11y.haptics)),
      setRow('Visual quality', 'Auto scales with battery and frame rate', `<select data-set="fxQuality">${['auto', 'high', 'medium', 'low'].map(o => `<option ${s.fxQuality === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`),
      setRow('Vision boxes', 'Bounding boxes + labels', switchHtml('vision.boxes', s.vision.boxes)),
      setRow('Vision scan FX', 'Scanning HUD overlay', switchHtml('vision.scanFx', s.vision.scanFx)),
      setRow('Gestures (experimental)', 'Palm-hold to pause — clearly experimental, camera-only heuristic', switchHtml('vision.gestures', s.vision.gestures)),
    ]);
  }

  if (tab === 'a11y') {
    rows([
      setRow('Reduced motion', 'Minimizes core animation and transitions', switchHtml('a11y.reducedMotion', s.a11y.reducedMotion)),
      setRow('High contrast', 'Stronger lines and brighter text', switchHtml('a11y.highContrast', s.a11y.highContrast)),
      setRow('Font scale', '', `<input type="range" min="0.9" max="1.4" step="0.05" data-set="a11y.fontScale" value="${s.a11y.fontScale}">`),
      `<div class="faint tiny" style="margin-top:10px">Voice-only interaction: every command works by voice; responses are read aloud. Keyboard: Ctrl+K palette, Esc close, F form factor. All controls expose accessible labels for screen readers.</div>`,
    ]);
  }

  if (tab === 'data') {
    rows([
      setRow('Audit log', 'Record local activity timestamps', switchHtml('privacy.auditLog', s.privacy.auditLog)),
      setRow('Store camera snapshots', 'For "remember this object" thumbnails (local only)', switchHtml('privacy.storeImages', s.privacy.storeImages)),
      setRow('Speaker recognition', 'Experimental acoustic voiceprint', switchHtml('privacy.speakerId', s.privacy.speakerId)),
      setRow('Face recognition', 'Experimental landmark templates', switchHtml('privacy.faceId', s.privacy.faceId)),
      `<div class="row" style="margin-top:14px"><button class="btn danger" id="data-wipe-mem">Wipe memory</button><button class="btn danger" id="data-reset">Reset all settings</button></div>`,
    ]);
    $('#data-wipe-mem').addEventListener('click', () => { if (confirm('Delete all memories?')) { Memory.wipe(); toast('Memory wiped.', 'warn'); } });
    $('#data-reset').addEventListener('click', () => { if (confirm('Reset settings to defaults?')) { Settings.reset(); applyA11yClasses(); renderSettings(); } });
  }

  // wire generic controls
  $$('#settings-content [data-set]').forEach(el => {
    el.addEventListener('input', () => {
      const path = el.dataset.set;
      const val = el.type === 'range' || el.type === 'number' ? parseFloat(el.value) : el.value;
      Settings.set(path, val);
      if (path.startsWith('a11y') || path.startsWith('voice') || path.startsWith('sounds')) applyA11yClasses();
    });
  });
  $$('#settings-content .switch').forEach(sw => {
    sw.addEventListener('click', () => {
      const path = sw.dataset.path;
      const cur = Settings.get(path);
      Settings.set(path, !cur);
      if (path.startsWith('a11y') || path.startsWith('voice') || path.startsWith('sounds')) applyA11yClasses();
      if (path === 'voice.wakeWord') emit('wake-word-toggle', !cur);
      sw.classList.toggle('on', !cur);
    });
  });
}

function sttDesc() {
  const ok = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return ok ? 'Platform recognizer available' : 'Unavailable in this browser — typed commands still work';
}

function setRow(label, desc, ctrl) {
  return `<div class="set-row"><div class="inf"><div class="lbl">${label}</div>${desc ? `<div class="desc">${desc}</div>` : ''}</div>${ctrl}</div>`;
}

function switchHtml(path, on) {
  return `<button class="switch ${on ? 'on' : ''}" data-path="${path}" role="switch" aria-checked="${on}" aria-label="${path}"></button>`;
}
