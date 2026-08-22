/** System Command Center — REAL device telemetry, honestly labeled. */
import { $ } from './../utils.js';
import { State, on } from './../state.js';
import { Settings } from './../settings.js';
import { listProviders } from './../providers/index.js';
import { Memory } from './../memory.js';

const checks = {
  battery: () => State.get('battery'),
  storage: () => State.get('device')?.storage,
  net: () => State.get('net'),
  ram: () => State.get('device')?.ram,
  cores: () => State.get('device')?.cores,
  charging: () => State.get('battery')?.charging,
  fold: () => State.get('formFactor'),
  fps: () => window.__jarvisFps ?? null,
};

export function renderSystem() {
  const body = $('#system-body');
  const dev = State.get('device') || {};
  const b = State.get('battery');
  const net = State.get('net');
  const vision = State.get('vision');
  const batteryPct = b ? Math.round(b.level * 100) : null;
  const storagePct = dev.storage ? Math.round((dev.storage.used / dev.storage.total) * 100) : null;

  body.innerHTML = `
    <div id="system-grid">
      <div class="sys-card">
        <h4>▮ Battery <span class="badge ${b ? 'real' : 'unavail'}">${b ? 'REAL' : 'UNAVAILABLE'}</span></h4>
        ${b ? `
          <div class="gauge">${gaugeSvg(batteryPct, batteryPct <= 25 ? '#ffb454' : '#57b8ff')}<div class="gv">${batteryPct}%</div></div>
          <div class="kv"><span class="k">State</span><span class="v">${b.charging ? 'Charging' : 'Discharging'}</span></div>
          ${b.charging ? `<div class="kv"><span class="k">Time to full</span><span class="v">${b.chargingTime !== Infinity ? Math.round(b.chargingTime / 60) + ' min' : 'unknown'}</span></div>` : ''}
        ` : '<div class="dim">Battery API not exposed in this environment. The Android build reports live charge state.</div>'}
      </div>

      <div class="sys-card">
        <h4>▤ Storage <span class="badge ${dev.storage ? 'real' : 'unavail'}">${dev.storage ? 'REAL' : 'UNAVAILABLE'}</span></h4>
        ${dev.storage ? `
          <div class="gauge">${gaugeSvg(storagePct, storagePct > 85 ? '#ff6b6b' : '#57b8ff')}<div class="gv">${storagePct}%</div></div>
          <div class="kv"><span class="k">Used</span><span class="v">${dev.storage.used} GB</span></div>
          <div class="kv"><span class="k">Total</span><span class="v">${dev.storage.total} GB</span></div>
        ` : '<div class="dim">Storage estimate unavailable.</div>'}
      </div>

      <div class="sys-card">
        <h4>⌁ Network <span class="badge real">REAL</span></h4>
        <div class="kv"><span class="k">Status</span><span class="v" style="color:${net.online ? 'var(--green)' : 'var(--red)'}">${net.online ? 'ONLINE' : 'OFFLINE'}</span></div>
        <div class="kv"><span class="k">Type</span><span class="v">${net.type || 'unknown'}</span></div>
        ${dev.net?.downlink != null ? `<div class="kv"><span class="k">Downlink</span><span class="v">${dev.net.downlink} Mbps</span></div>` : ''}
        ${dev.net?.rtt != null ? `<div class="kv"><span class="k">Latency</span><span class="v">${dev.net.rtt} ms</span></div>` : ''}
        <div class="kv"><span class="k">Offline mode</span><span class="v">${net.online ? 'standby' : 'ACTIVE'}</span></div>
      </div>

      <div class="sys-card">
        <h4>◫ Compute <span class="badge ${dev.ram != null ? 'real' : 'unavail'}">${dev.ram != null ? 'REAL' : 'PARTIAL'}</span></h4>
        <div class="kv"><span class="k">Device memory</span><span class="v">${dev.ram != null ? dev.ram + ' GB' : 'unavailable'}</span></div>
        <div class="kv"><span class="k">CPU cores</span><span class="v">${dev.cores ?? 'unavailable'}</span></div>
        <div class="kv"><span class="k">Platform</span><span class="v">${dev.platform || 'unknown'}</span></div>
        <div class="kv"><span class="k">Render fps</span><span class="v">${window.__jarvisFps ? window.__jarvisFps + ' fps' : '—'}</span></div>
      </div>

      <div class="sys-card">
        <h4>▣ AI Subsystems</h4>
        <div class="kv"><span class="k">Vision model</span><span class="v">${vision.modelReady ? 'YOLO11n · ONNX · on-device' : vision.modelLoading ? 'loading…' : 'unavailable'}</span></div>
        <div class="kv"><span class="k">OCR</span><span class="v">${window.Tesseract ? 'Tesseract · on-device' : 'unavailable'}</span></div>
        <div class="kv"><span class="k">Face detection</span><span class="v">${vision.faceApi ? 'FaceDetector API' : 'unavailable here'}</span></div>
        <div class="kv"><span class="k">Active engine</span><span class="v">${Settings.get('provider.id')}</span></div>
        <div class="kv"><span class="k">Memory entries</span><span class="v">${Memory.all().length}</span></div>
      </div>

      <div class="sys-card">
        <h4>▭ Fold State</h4>
        <div class="kv"><span class="k">Form factor</span><span class="v">${State.get('formFactor').toUpperCase()}</span></div>
        <div class="kv"><span class="k">Viewport</span><span class="v">${innerWidth}×${innerHeight}</span></div>
        <div class="kv"><span class="k">Focus mode</span><span class="v">${State.get('focusMode') ? 'active' : 'inactive'}</span></div>
        <div class="kv"><span class="k">FX quality</span><span class="v">${Settings.get('fxQuality')}</span></div>
      </div>
    </div>
    <div class="faint tiny" style="margin-top:14px;line-height:1.7">
      REAL = live platform data. UNAVAILABLE = the web environment does not expose this sensor (temperature, exact RAM, sensor list, app list). The native Android build reports these via BatteryManager, StatFs, ActivityManager and SensorManager.
    </div>`;

  const off = on('device-refresh', () => { if (State.get('panel') === 'system') renderSystem(); });
  window.__sysOff = off;
}

function gaugeSvg(pct, color) {
  const r = 38, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return `<svg width="92" height="92" viewBox="0 0 92 92">
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="rgba(110,180,255,0.12)" stroke-width="6"/>
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${dash} ${c - dash}" style="transition:stroke-dasharray 900ms var(--ease)"/>
  </svg>`;
}
