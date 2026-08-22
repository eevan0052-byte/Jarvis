/**
 * JARVIS AI Core — canvas renderer.
 * One coherent particle/ring system whose parameters are driven by the
 * assistant state machine. Physically coherent: every state is a smooth
 * lerp between parameter targets, never a cut.
 *
 * Quality scaling: particle count / glow / grid density adapt to battery and
 * measured frame rate (battery-conscious, per spec §23).
 */
import { State, on } from './state.js';
import { Settings } from './settings.js';

const TAU = Math.PI * 2;

export class CoreRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = this.cv.getContext('2d');
    this.particles = [];
    this.nodes = [];
    this.wave = new Float32Array(96).fill(0.02);
    this.par = {
      radius: 0, rot: 0, ringSpeed: 0.05, pulse: 1, pulseT: 0,
      energy: 0, scanT: 0, neuralT: 0, glow: 0, alertMix: 0,
    };
    this.quality = 'high';
    this.fpsEma = 60;
    this.lowFpsSince = 0;
    this.started = false;
    this.lastT = 0;
    this.visible = true;
    this.center = { x: 0, y: 0 };
    this.targetCenter = { x: 0, y: 0 };
    this.initParticles();
    on('mode', (m) => this.onMode(m));
    on('voice-level', (lvl) => { this.voiceLevel = lvl; });
    on('fx-quality', (q) => { this.setQuality(q); });
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
      if (this.visible) this.lastT = performance.now();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onMode(m) {
    if (m.mode === 'SPEAKING') this.speechStart = performance.now();
  }

  setQuality(q) {
    if (q === 'auto') {
      const b = State.get('battery');
      q = b && !b.charging ? (b.level <= 0.12 ? 'low' : b.level <= 0.3 ? 'medium' : 'high') : 'high';
      if (Settings.get('fxQuality') !== 'auto') q = Settings.get('fxQuality');
    }
    this.quality = q;
    this.rebuildParticles();
  }

  rebuildParticles() {
    const count = { high: 150, medium: 80, low: 36 }[this.quality] || 80;
    while (this.particles.length < count) {
      this.particles.push({
        angle: Math.random() * TAU, dist: 0.5 + Math.random(), speed: 0.1 + Math.random() * 0.25,
        size: 0.6 + Math.random() * 1.6, jitter: Math.random() * TAU, hue: Math.random() < 0.18 ? 180 : 205,
        alpha: 0.25 + Math.random() * 0.5,
      });
    }
    this.particles.length = count;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = innerWidth * dpr;
    this.cv.height = innerHeight * dpr;
    this.cv.style.width = innerWidth + 'px';
    this.cv.style.height = innerHeight + 'px';
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  layout() {
    const fold = State.get('formFactor');
    this.targetCenter = fold === 'cover'
      ? { x: innerWidth / 2, y: innerHeight * 0.30 }
      : { x: innerWidth / 2, y: innerHeight * 0.46 };
    this.baseRadius = fold === 'cover' ? Math.min(innerWidth * 0.19, 130) : Math.min(innerWidth, innerHeight) * 0.16;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (this.visible) this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(t) {
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    // adaptive fps tracking
    this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    if (this.fpsEma < 38 && this.quality === 'high') { if (++this.lowFpsSince > 240) { this.setQuality('medium'); State.log('Rendering quality reduced (frame rate)', 'FX'); } }
    else this.lowFpsSince = 0;

    const mode = State.get('mode');
    const P = this.par;
    const reduced = document.documentElement.classList.contains('reduced-motion');

    // ── state targets (physically coherent parameter space) ──
    let targetEnergy = 0.25, targetRing = 1.0, targetSpeed = 0.05, targetGlow = 0.5, targetAlert = 0, targetNeural = 0;
    switch (mode) {
      case 'BOOTING': targetEnergy = 1.6; targetRing = 1.25; targetSpeed = 0.5; targetGlow = 1.0; break;
      case 'LISTENING': targetEnergy = 1.0 + (this.voiceLevel || 0) * 1.2; targetRing = 1.18; targetSpeed = 0.22; targetGlow = 0.9; break;
      case 'THINKING': targetEnergy = 1.3; targetRing = 1.05; targetSpeed = 0.3; targetGlow = 1.0; targetNeural = 1; break;
      case 'PROCESSING': targetEnergy = 1.1; targetRing = 1.1; targetSpeed = 0.4; targetGlow = 0.9; targetNeural = 0.7; break;
      case 'SPEAKING': targetEnergy = 0.9; targetRing = 1.1; targetSpeed = 0.14; targetGlow = 0.85; break;
      case 'VISION': targetEnergy = 0.8; targetRing = 1.3; targetSpeed = 0.12; targetGlow = 0.7; break;
      case 'ALERT': targetEnergy = 0.7; targetRing = 1.0; targetSpeed = 0.08; targetGlow = 0.7; targetAlert = 1; break;
      default: targetEnergy = 0.25; targetRing = 1.0; targetSpeed = 0.05; targetGlow = 0.5;
    }
    if (reduced) { targetSpeed *= 0.15; targetEnergy *= 0.4; }

    // speaking pulse: synthetic speech envelope from utterance timing
    if (mode === 'SPEAKING') {
      const el = (t - (this.speechStart || t)) / 1000;
      P.pulseT += dt * 9;
      targetEnergy = 0.85 + 0.35 * Math.abs(Math.sin(P.pulseT * 1.7) * Math.sin(P.pulseT * 0.53)) * Math.exp(-el * 0.5);
    }

    const k = 1 - Math.exp(-dt * 3.2);
    P.energy = P.energy + (targetEnergy - P.energy) * k;
    P.ringScale = (P.ringScale ?? 1) + (targetRing - (P.ringScale ?? 1)) * k;
    P.ringSpeed = P.ringSpeed + (targetSpeed - P.ringSpeed) * k;
    P.glow = P.glow + (targetGlow - P.glow) * k;
    P.alertMix = P.alertMix + (targetAlert - P.alertMix) * k;
    P.neural = P.neural + (targetNeural - P.neural) * k;
    P.rot += P.ringSpeed * dt * (mode === 'VISION' ? 1 : 1);
    P.scanT += dt * (mode === 'VISION' ? 0.9 : 0.18);
    P.neuralT += dt;

    // waveform shift
    this.wave.copyWithin(0, 1);
    this.wave[95] = (this.voiceLevel || 0) * (mode === 'LISTENING' ? 1 : 0.15) + Math.random() * 0.02;

    // center easing
    this.center.x += (this.targetCenter.x - this.center.x) * (1 - Math.exp(-dt * 3));
    this.center.y += (this.targetCenter.y - this.center.y) * (1 - Math.exp(-dt * 3));

    this.draw(dt);
  }

  draw(dt) {
    const { cx } = this;
    const { x, y } = this.center;
    const R = this.baseRadius * (this.par.ringScale || 1);
    const t = this.par.rot;
    const alert = this.par.alertMix;
    const hue = lerp(210, 38, alert);        // blue → amber on alert
    const hue2 = lerp(188, 30, alert);
    const mode = State.get('mode');

    cx.clearRect(0, 0, innerWidth, innerHeight);

    // ── ambient backdrop ──
    const bg = cx.createRadialGradient(x, y, 0, x, y, Math.max(innerWidth, innerHeight) * 0.75);
    bg.addColorStop(0, `rgba(16,32,54,${0.16 * this.par.glow})`);
    bg.addColorStop(1, 'rgba(4,6,10,0)');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, innerWidth, innerHeight);

    if (this.quality !== 'low') this.drawGrid();
    this.drawDataStreams();

    const glow = this.quality === 'low' ? 0 : this.par.glow;
    cx.save();
    cx.translate(x, y);

    // ── rings ──
    const rings = [
      { r: R * 1.0, w: 1, seg: 0.62, sp: 1, col: hue2, a: 0.5 },
      { r: R * 1.16, w: 1.4, seg: 0.34, sp: -1.6, col: hue, a: 0.75 },
      { r: R * 1.34, w: 0.8, seg: 0.8, sp: 0.7, col: hue2, a: 0.35 },
    ];
    if (mode !== 'IDLE' && mode !== 'BOOTING') rings.push({ r: R * 1.5, w: 0.6, seg: 0.3, sp: -2.4, col: hue, a: 0.3 });
    if (mode === 'VISION' || mode === 'PROCESSING') rings.push({ r: R * 1.66, w: 0.5, seg: 0.24, sp: 2.8, col: hue2, a: 0.3 });

    for (const rg of rings) {
      if (this.quality === 'low' && rg.w < 1) continue;
      cx.strokeStyle = `hsla(${rg.col},85%,62%,${rg.a * (0.7 + 0.3 * this.par.energy)})`;
      cx.lineWidth = rg.w;
      cx.beginPath();
      const a0 = t * rg.sp;
      for (let i = 0; i < 3; i++) {
        const a = a0 + i * (TAU / 3);
        cx.arc(0, 0, rg.r, a, a + TAU * rg.seg);
      }
      cx.stroke();
    }

    // ── waveform ring (listening) ──
    if (mode === 'LISTENING') this.drawWaveform(R * 1.24, hue2);

    // ── nucleus ──
    const pulseR = R * 0.42 * (1 + 0.06 * Math.sin(this.par.pulseT * 2.1) * this.par.energy);
    const nuc = cx.createRadialGradient(0, 0, 0, 0, 0, pulseR);
    nuc.addColorStop(0, `hsla(${hue},95%,${70 + 12 * this.par.energy}%,${0.5 + 0.3 * this.par.energy})`);
    nuc.addColorStop(0.55, `hsla(${hue},90%,48%,${0.32})`);
    nuc.addColorStop(1, 'hsla(220,80%,40%,0)');
    if (glow > 0.05) { cx.shadowColor = `hsla(${hue},95%,60%,${0.5 * glow})`; cx.shadowBlur = 26 * glow; }
    cx.fillStyle = nuc;
    cx.beginPath(); cx.arc(0, 0, pulseR, 0, TAU); cx.fill();
    cx.shadowBlur = 0;

    // inner geometry: rotating hex / triangle wireframe
    cx.strokeStyle = `hsla(${hue},80%,70%,${0.35 + 0.2 * this.par.energy})`;
    cx.lineWidth = 1;
    cx.beginPath();
    const sides = mode === 'THINKING' || mode === 'PROCESSING' ? 6 : 3;
    const rGeo = pulseR * 0.62;
    for (let i = 0; i <= sides; i++) {
      const a = t * 1.4 + (i / sides) * TAU;
      const px = Math.cos(a) * rGeo, py = Math.sin(a) * rGeo;
      i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
    }
    cx.closePath(); cx.stroke();

    // ── neural connections (thinking/processing) ──
    if (this.par.neural > 0.05 && this.quality !== 'low') this.drawNeural(R, hue2, dt);

    // ── vision scan state ──
    if (mode === 'VISION') this.drawScanner(R, hue);

    // ── particles ──
    this.drawParticles(R, hue, dt);

    // ── HUD micro labels (real data) ──
    this.drawMicroLabels(R, hue);

    cx.restore();

    // ── vignette ──
    const vg = cx.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.3, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    cx.fillStyle = vg;
    cx.fillRect(0, 0, innerWidth, innerHeight);
  }

  drawGrid() {
    const { cx } = this;
    cx.strokeStyle = 'rgba(90,160,220,0.05)';
    cx.lineWidth = 1;
    const gap = 90;
    for (let gx = (innerWidth / 2) % gap; gx < innerWidth; gx += gap) {
      cx.beginPath(); cx.moveTo(gx, 0); cx.lineTo(gx, innerHeight); cx.stroke();
    }
    for (let gy = (innerHeight / 2) % gap; gy < innerHeight; gy += gap) {
      cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(innerWidth, gy); cx.stroke();
    }
  }

  drawDataStreams() {
    const { cx } = this;
    const t = performance.now() / 1000;
    cx.fillStyle = 'rgba(120,190,255,0.10)';
    const n = this.quality === 'high' ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const sx = ((i * 7919 + 313) % Math.floor(innerWidth));
      const len = 40 + (i * 53 % 90);
      const speed = 30 + (i * 17 % 40);
      const yy = ((t * speed) % (innerHeight + len * 2)) - len;
      cx.fillRect(sx, yy, 1, len);
    }
  }

  drawWaveform(R, hue) {
    const { cx } = this;
    cx.strokeStyle = `hsla(${hue},90%,65%,0.9)`;
    cx.lineWidth = 1.6;
    cx.beginPath();
    const N = this.wave.length;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU - Math.PI / 2;
      const v = this.wave[i];
      const rr = R * (1 + v * 0.14);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
    }
    cx.stroke();
    cx.strokeStyle = `hsla(${hue},90%,65%,0.25)`;
    cx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU - Math.PI / 2;
      const rr = R * (1 - this.wave[i] * 0.14);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
    }
    cx.stroke();
  }

  drawNeural(R, hue, dt) {
    const { cx } = this;
    if (!this.nodes.length || this.nodes[0].R !== R) {
      this.nodes = [];
      const count = 26;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const r = R * (1.05 + Math.random() * 0.55);
        const z = (Math.random() - 0.5) * 2;
        this.nodes.push({ a, r, z, R, phase: Math.random() * 100, speed: 0.2 + Math.random() * 0.5 });
      }
    }
    const active = this.par.neural;
    for (const n of this.nodes) {
      n.a += n.speed * dt * 0.6;
      const zz = Math.sin(this.par.neuralT * n.speed * 2 + n.phase) * R * 0.28;
      const px = Math.cos(n.a) * n.r, py = Math.sin(n.a) * n.r * 0.7 + zz * 0.6;
      const sz = 1.4 + (zz / (R * 0.28) + 1) * 1.4;
      cx.fillStyle = `hsla(${hue},85%,68%,${0.5 * active})`;
      cx.beginPath(); cx.arc(px, py, sz, 0, TAU); cx.fill();
    }
    // traveling pulses along connections
    cx.strokeStyle = `hsla(${hue},85%,70%,${0.35 * active})`;
    cx.lineWidth = 0.8;
    for (let i = 0; i < this.nodes.length - 1; i += 2) {
      const a = this.nodes[i], b = this.nodes[i + 1];
      const ax = Math.cos(a.a) * a.r, ay = Math.sin(a.a) * a.r * 0.7;
      const bx = Math.cos(b.a) * b.r, by = Math.sin(b.a) * b.r * 0.7;
      const u = (this.par.neuralT * 0.9 + a.phase) % 1;
      cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(bx, by); cx.stroke();
      cx.fillStyle = `hsla(${hue},95%,75%,${0.8 * active})`;
      cx.beginPath(); cx.arc(lerp(ax, bx, u), lerp(ay, by, u), 1.8, 0, TAU); cx.fill();
    }
  }

  drawScanner(R, hue) {
    const { cx } = this;
    // radar sweep
    const grad = cx.createConicGradient ? null : null;
    cx.save();
    cx.beginPath(); cx.arc(0, 0, R * 1.8, 0, TAU); cx.clip();
    const a = this.par.scanT * TAU;
    if (cx.createConicGradient) {
      const cg = cx.createConicGradient(a - 0.35, 0, 0);
      cg.addColorStop(0, `hsla(${hue},90%,60%,0.16)`);
      cg.addColorStop(1, 'hsla(0,0%,0%,0)');
      cx.fillStyle = cg;
      cx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
    }
    // sweeping scan line
    const sy = Math.sin(this.par.scanT * TAU * 0.9) * R * 1.5;
    cx.strokeStyle = `hsla(${hue},95%,68%,0.5)`;
    cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(-R * 1.9, sy); cx.lineTo(R * 1.9, sy); cx.stroke();
    cx.restore();
    // corner brackets
    cx.strokeStyle = `hsla(${hue},90%,65%,0.75)`;
    cx.lineWidth = 1.4;
    const br = R * 1.9, bl = R * 0.32;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      cx.beginPath();
      cx.moveTo(sx * br, sy * br - sy * bl);
      cx.lineTo(sx * br, sy * br);
      cx.lineTo(sx * br - sx * bl, sy * br);
      cx.stroke();
    }
  }

  drawParticles(R, hue, dt) {
    const { cx } = this;
    const mode = State.get('mode');
    const energy = this.par.energy;
    for (const p of this.particles) {
      p.angle += p.speed * dt * (0.4 + energy * 1.6) * (p.dist > 1 ? 0.6 : 1);
      p.jitter += dt * (0.5 + energy);
      const jr = Math.sin(p.jitter) * 0.035 * R * energy;
      const rr = R * p.dist * (1 + energy * 0.10) + jr;
      const px = Math.cos(p.angle) * rr;
      const py = Math.sin(p.angle) * rr * 0.92;
      const a = p.alpha * (0.4 + energy * 0.6) * (mode === 'IDLE' ? 0.5 : 1);
      cx.fillStyle = `hsla(${p.hue},85%,${60 + energy * 15}%,${a})`;
      cx.beginPath();
      cx.arc(px, py, p.size * (0.8 + energy * 0.3), 0, TAU);
      cx.fill();
      // occasional orbit trail
      if (p.size > 1.8 && this.quality === 'high') {
        cx.strokeStyle = `hsla(${p.hue},85%,65%,${a * 0.25})`;
        cx.lineWidth = 0.6;
        cx.beginPath();
        cx.arc(0, 0, rr, p.angle - 0.06, p.angle);
        cx.stroke();
      }
    }
  }

  drawMicroLabels(R, hue) {
    if (this.quality === 'low') return;
    const { cx } = this;
    const mode = State.get('mode');
    const dev = State.get('device') || {};
    const fps = Math.round(this.fpsEma);
    cx.font = '9px "JetBrains Mono", "SF Mono", monospace';
    cx.textAlign = 'left';
    cx.fillStyle = `hsla(${hue},60%,70%,0.5)`;
    cx.fillText(`CORE::${mode.padEnd(9, ' ')}`, R * 0.85, R * 0.8);
    cx.fillStyle = 'hsla(210,40%,70%,0.35)';
    cx.fillText(`SYS.LOAD ${fps}FPS · MEM ${State.get('memory').count} · ${dev.cores || '?'}C`, R * 0.85, R * 0.8 + 13);
    cx.fillText(`QTY ${this.quality.toUpperCase()}`, R * 0.85, R * 0.8 + 26);
    cx.textAlign = 'right';
    cx.fillText(`R.${(R).toFixed(0)}`, -R * 0.85, -R * 0.62);
    cx.textAlign = 'left';
    cx.fillText(`T+${fmtUptime()}`, -R * 0.85, -R * 0.62);
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
let bootT0 = Date.now();
function fmtUptime() {
  const s = Math.floor((Date.now() - bootT0) / 1000);
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return `${String(h % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
