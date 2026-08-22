/**
 * JARVIS static + API server.
 * Zero-dependency Node server:
 *   - Serves public/ with correct MIME types and cache policy.
 *   - /api/health                     — liveness probe.
 *   - /api/proxy/:provider            — optional server-side relay for cloud LLM keys
 *     (keeps the API key out of the browser; see README "Server key relay").
 *   - Security headers + CSP. No hard-coded secrets anywhere.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8787;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Server-side secret storage (only used by the optional relay mode).
// Keys are held in server-config.enc.json, AES-256-GCM encrypted with a
// 32-byte master key from server-config.key (gitignored). Nothing is ever
// hard-coded in the application or shipped in source control.
// ---------------------------------------------------------------------------
const CONFIG_KEY_FILE = path.join(__dirname, 'server-config.key');
const CONFIG_ENC_FILE = path.join(__dirname, 'server-config.enc.json');

function loadServerSecrets() {
  try {
    const keyB64 = fs.readFileSync(CONFIG_KEY_FILE, 'utf8').trim();
    const key = Buffer.from(keyB64, 'base64');
    const enc = JSON.parse(fs.readFileSync(CONFIG_ENC_FILE, 'utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch {
    return null; // relay disabled — direct-browser mode still works
  }
}
const SERVER_SECRETS = loadServerSecrets();

// ---------------------------------------------------------------------------
// MIME + cache policy
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const CACHE_LONG = 7 * 24 * 3600;   // vendored models — immutable-ish
const CACHE_SHORT = 60;

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

function serveFile(req, res, urlPath) {
  let p = path.normalize(urlPath).replace(/^([/\\])+/, '');
  if (p === '') p = 'index.html';
  const fp = path.join(PUBLIC, p);
  if (!fp.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(fp).toLowerCase();
    const inVendor = fp.includes(path.sep + 'vendor' + path.sep);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': inVendor ? `public, max-age=${CACHE_LONG}` : `no-cache`,
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(fp).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Relay proxy: POST /api/proxy/:provider  {model, messages, ...}
// The browser never sees the key in relay mode.
// ---------------------------------------------------------------------------
const RELAY_TARGETS = {
  openai: { url: (s) => `${s.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, auth: (s, h) => h['Authorization'] = `Bearer ${s.key}`, body: (b, s) => ({ model: s.model || b.model || 'gpt-4o-mini', messages: b.messages, max_tokens: b.max_tokens || 600 }) },
  anthropic: { url: (s) => 'https://api.anthropic.com/v1/messages', auth: (s, h) => { h['x-api-key'] = s.key; h['anthropic-version'] = '2023-06-01'; }, body: (b, s) => ({ model: s.model || b.model || 'claude-3-5-haiku-latest', max_tokens: b.max_tokens || 600, system: b.system || '', messages: b.messages }) },
  gemini: { url: (s) => `https://generativelanguage.googleapis.com/v1beta/models/${s.model || b.model || 'gemini-1.5-flash'}:generateContent`, auth: () => {}, body: (b, s) => ({ contents: b.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }) },
};

async function handleProxy(req, res, providerName, body) {
  const t = RELAY_TARGETS[providerName];
  const cfg = SERVER_SECRETS && SERVER_SECRETS[providerName];
  if (!t || !cfg || !cfg.key) return send(res, 503, JSON.stringify({ error: 'Relay not configured for this provider.' }));
  try {
    const headers = { 'Content-Type': 'application/json' };
    t.auth(cfg, headers);
    const url = t.url(cfg);
    if (providerName === 'gemini') url += `?key=${encodeURIComponent(cfg.key)}`;
    const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(t.body(body, cfg)) });
    const text = await upstream.text();
    send(res, upstream.status, text, { 'Content-Type': 'application/json' });
  } catch (e) {
    send(res, 502, JSON.stringify({ error: 'Upstream provider unreachable: ' + e.message }));
  }
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",           // small inline style tags for dynamic HUD geometry
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:*", // BYOK endpoints + local models
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const baseHeaders = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), autoplay=(self), display-capture=()',
  };
  Object.assign(baseHeaders, { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, ts: Date.now(), relay: SERVER_SECRETS ? Object.keys(SERVER_SECRETS) : [] }), { ...baseHeaders, 'Content-Type': 'application/json' });
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/proxy/')) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { return handleProxy(req, res, url.pathname.split('/').pop(), JSON.parse(body || '{}')); }
      catch { return send(res, 400, JSON.stringify({ error: 'Bad request' }), { ...baseHeaders, 'Content-Type': 'application/json' }); }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed', baseHeaders);
  }
  return serveFile(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`JARVIS server online — http://localhost:${PORT}`);
  console.log(SERVER_SECRETS ? 'Relay mode: ENABLED (server-side keys loaded).' : 'Relay mode: disabled (no server-config.enc.json). Direct-browser BYOK mode available in Settings → AI Engine.');
});
