/** JARVIS service worker — offline shell + vendored model cache. */
const CACHE = 'jarvis-v1';
const PRECACHE = [
  './',
  './index.html',
  './css/base.css', './css/layout.css', './css/hud.css', './css/vision.css', './css/panels.css',
  './vendor/onnx/ort.min.js', './vendor/onnx/ort-wasm-simd-threaded.wasm',
  './vendor/models/yolo11n.onnx',
  './vendor/tesseract/tesseract.min.js', './vendor/tesseract/worker.min.js', './vendor/tesseract/core.wasm.js',
  './vendor/tessdata/eng.traineddata.gz',
];
// app JS is network-first with cache fallback; vendor is cache-first.

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const isVendor = url.pathname.includes('/vendor/');
  if (isVendor) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(e.request).then(res => res).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
