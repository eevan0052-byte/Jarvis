/**
 * Device intelligence — REAL metrics from the platform, honestly labeled.
 * Web platform exposes: battery, network, storage estimate, device memory,
 * CPU count, screen, online state. Everything else is marked unavailable.
 * (The Android app reads BatteryManager/StatFs/ActivityManager/sensors.)
 */
import { State, emit } from './state.js';

let battery = null;
let conn = null;
let tickTimer = null;

export async function initDevice() {
  // battery
  try {
    if (navigator.getBattery) {
      battery = await navigator.getBattery();
      battery.addEventListener('levelchange', refresh);
      battery.addEventListener('chargingchange', refresh);
    }
  } catch { battery = null; }
  // network
  conn = navigator.connection || null;
  if (conn) conn.addEventListener('change', refresh);

  window.addEventListener('online', () => { State.patch({ net: { ...State.get('net'), online: true } }); refresh(); emit('net-change'); });
  window.addEventListener('offline', () => { State.patch({ net: { ...State.get('net'), online: false } }); refresh(); emit('net-change'); });

  refresh();
  tickTimer = setInterval(refresh, 15000);
}

async function refresh() {
  const online = navigator.onLine;
  let storage = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota && est.usage != null) {
        storage = {
          total: +((est.quota) / 1e9).toFixed(1),
          used: +((est.usage) / 1e9).toFixed(2),
        };
      }
    }
  } catch { storage = null; }

  const dev = {
    battery: battery ? { level: battery.level, charging: battery.charging, chargingTime: battery.chargingTime, dischargingTime: battery.dischargingTime } : null,
    net: {
      online,
      type: conn ? (conn.effectiveType || conn.type || 'unknown') : (online ? 'unknown' : 'offline'),
      downlink: conn?.downlink ?? null,
      rtt: conn?.rtt ?? null,
    },
    storage,
    ram: navigator.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    platform: navigator.platform || 'unknown',
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
  State.patch({ device: dev, net: { online, type: dev.net.type }, battery: dev.battery });
  emit('device-refresh', dev);

  // Battery Saver: auto-reduce FX below 25% (predictive, reversible)
  const q = (window.jarvisQualityOverride) ? null : qualityForBattery(dev.battery);
  if (q) emit('fx-quality', q);
}

function qualityForBattery(b) {
  if (!b || b.charging) return null;
  if (b.level <= 0.12) return 'low';
  if (b.level <= 0.3) return 'medium';
  return null;
}

export function batteryLevel() { return battery ? Math.round(battery.level * 100) : null; }
