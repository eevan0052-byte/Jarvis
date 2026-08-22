/**
 * Weather via Open-Meteo (free, no API key, CORS-enabled).
 * Location: user-granted geolocation, or a manual city (geocoded).
 * Data is cached; stale cache is used when offline (clearly marked).
 */
import { State, emit } from './state.js';
import { Settings } from './settings.js';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_URL = 'https://api.open-meteo.com/v1/forecast';

export async function refreshWeather({ force = false } = {}) {
  const w = Settings.get('weather');
  if (!w.lat || !w.lon) return null;
  if (!force && State.get('weather') && Date.now() - State.get('weather').ts < 20 * 60_000) return State.get('weather');

  try {
    const params = new URLSearchParams({
      latitude: w.lat, longitude: w.lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto', forecast_days: 5,
    });
    const res = await fetch(`${WX_URL}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const weather = {
      city: w.city || 'your location',
      current: {
        temp: data.current.temperature_2m,
        feels: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        wind: Math.round(data.current.wind_speed_10m),
        condition: data.current.weather_code,
      },
      daily: (data.daily.time || []).map((t, i) => ({
        date: t, code: data.daily.weather_code[i],
        hi: Math.round(data.daily.temperature_2m_max[i]),
        lo: Math.round(data.daily.temperature_2m_min[i]),
      })),
      source: 'Open-Meteo', ts: Date.now(), stale: false,
    };
    State.patch({ weather });
    emit('weather', weather);
    State.log(`Weather refreshed for ${weather.city}`, 'ENV');
    return weather;
  } catch (e) {
    const cached = State.get('weather');
    if (cached) {
      const stale = { ...cached, stale: true };
      State.patch({ weather: stale });
      emit('weather', stale);
    }
    throw e;
  }
}

export async function geocodeCity(city) {
  const res = await fetch(`${GEO_URL}?name=${encodeURIComponent(city)}&count=3&language=en&format=json`);
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.results?.length) throw new Error(`City "${city}" not found`);
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, city: r.name + (r.admin1 ? `, ${r.admin1}` : '') + (r.country ? `, ${r.country}` : '') };
}

export async function useGeolocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), city: null }),
      (err) => reject(new Error(err.message)),
      { timeout: 12000, maximumAge: 300000 });
  });
}

/** After lat/lon resolution, reverse-label the city. */
export async function reverseLabel(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    if (res.ok) {
      const d = await res.json();
      return d.city || d.locality || d.principalSubdivision || '';
    }
  } catch {}
  return '';
}
