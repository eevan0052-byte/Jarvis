/**
 * Vision pipeline — real, on-device, no cloud.
 *  · Object detection: YOLO11n (COCO 80 classes) via ONNX Runtime Web/WASM.
 *  · Face detection:   native FaceDetector API when the platform exposes it.
 *  · OCR:              Tesseract.js with eng-fast model (vendored).
 *  · Scene analysis:   brightness, dominant colors, motion, edge density.
 * Everything runs in this browser session; frames are never uploaded.
 */
import { State, emit } from './state.js';
import { Settings } from './settings.js';

const MODEL_URL = 'vendor/models/yolo11n.onnx';
const WASM_PATHS = 'vendor/onnx/';
const INPUT_SIZE = 640;
const CONF = () => Settings.get('vision.confidence') ?? 0.3;
const IOU = 0.45;

const COCO_CLASSES = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'];

let session = null;
let stream = null;
let videoEl = null;
let running = false;
let busy = false;
let lastFrame = null;
let prevGray = null;
let tesseractWorker = null;
let faceDetector = null;

export function visionStatus() {
  return {
    modelReady: !!session,
    faceApi: !!window.FaceDetector,
    ocr: !!window.Tesseract,
    camera: !!stream,
  };
}

export async function loadModel(onProgress) {
  if (session) return session;
  State.patch({ vision: { ...State.get('vision'), modelLoading: true } });
  onProgress && onProgress(10, 'Loading ONNX runtime');
  try {
    if (!window.ort) throw new Error('onnxruntime not loaded');
    ort.env.wasm.wasmPaths = WASM_PATHS;
    ort.env.wasm.numThreads = 1; // no SharedArrayBuffer in sandboxed contexts
    onProgress && onProgress(35, 'Compiling WASM backend');
    session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    State.patch({ vision: { ...State.get('vision'), modelReady: true, modelLoading: false } });
    emit('vision-model-ready');
    State.log('Object detection model online (YOLO11n, on-device)', 'VISION');
    return session;
  } catch (e) {
    State.patch({ vision: { ...State.get('vision'), modelLoading: false, lastError: e.message } });
    emit('vision-model-error', e.message);
    throw e;
  }
}

/* ── camera ───────────────────────────────────────────────────────────────── */
export async function startCamera(video) {
  if (stream) return stream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable in this environment.');
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl = video;
  video.srcObject = stream;
  await video.play().catch(() => {});
  State.patch({ vision: { ...State.get('vision'), cameraOn: true, active: true } });
  emit('camera-on');
  State.log('Camera active — user-visible indicator on', 'VISION');
  return stream;
}

export function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (videoEl) { videoEl.srcObject = null; videoEl = null; }
  running = false;
  State.patch({ vision: { ...State.get('vision'), cameraOn: false, active: false, detections: [], faces: [], scene: null } });
  emit('camera-off');
  State.log('Camera released', 'VISION');
}

/* ── detection loop ───────────────────────────────────────────────────────── */
export function startDetectionLoop() {
  running = true;
  const tick = async () => {
    if (!running) return;
    if (videoEl && session && !busy && videoEl.readyState >= 2) {
      busy = true;
      try {
        const dets = await detectFrame(videoEl);
        State.patch({ vision: { ...State.get('vision'), detections: dets } });
        emit('detections', dets);
      } catch (e) { /* frame dropped */ }
      busy = false;
    }
    setTimeout(tick, Math.max(80, 1000 / (Settings.get('vision.maxFps') || 8)));
  };
  tick();
}

export function stopDetectionLoop() { running = false; }

async function detectFrame(video) {
  const c = document.createElement('canvas');
  c.width = INPUT_SIZE; c.height = INPUT_SIZE;
  const g = c.getContext('2d', { willReadFrequently: true });
  // letterbox with gray padding
  const scale = Math.min(INPUT_SIZE / video.videoWidth, INPUT_SIZE / video.videoHeight);
  const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
  const ox = (INPUT_SIZE - w) / 2, oy = (INPUT_SIZE - h) / 2;
  g.fillStyle = '#707070'; g.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  g.drawImage(video, ox, oy, w, h);
  const img = g.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    input[p] = img.data[i] / 255;
    input[INPUT_SIZE * INPUT_SIZE + p] = img.data[i + 1] / 255;
    input[2 * INPUT_SIZE * INPUT_SIZE + p] = img.data[i + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds = { images: tensor };
  const out = await session.run(feeds);
  const raw = out[Object.keys(out)[0]].data;

  const boxes = decodeYolo(raw, INPUT_SIZE, INPUT_SIZE);
  const nmsed = nms(boxes);
  // map back to video coordinates
  return nmsed.map(b => ({
    label: b.label,
    score: b.score,
    x: Math.max(0, (b.x1 - ox) / scale), y: Math.max(0, (b.y1 - oy) / scale),
    w: (b.x2 - b.x1) / scale, h: (b.y2 - b.y1) / scale,
  }));
}

/** Decode YOLOv8/11 output [1, 84, 8400] → candidate boxes in model space. */
export function decodeYolo(raw, imW, imH) {
  const nc = 80;
  const strides = [8, 16, 32];
  const boxes = [];
  const nAnchors = 8400;
  const dets = nc + 4;

  let anchorIdx = 0;
  for (const stride of strides) {
    const grid = imW / stride;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const base = anchorIdx;
        // class scores
        let bestCls = -1, bestScore = 0;
        for (let c = 0; c < nc; c++) {
          const s = raw[(4 + c) * nAnchors + base];
          if (s > bestScore) { bestScore = s; bestCls = c; }
        }
        if (bestScore < CONF()) { anchorIdx++; continue; }
        // YOLOv8/11 exports decoded boxes: cx, cy, w, h are in INPUT PIXEL space.
        const cx = raw[0 * nAnchors + base], cy = raw[1 * nAnchors + base];
        const w = raw[2 * nAnchors + base], h = raw[3 * nAnchors + base];
        const x1 = Math.max(0, cx - w / 2), y1 = Math.max(0, cy - h / 2);
        const x2 = Math.min(imW, cx + w / 2), y2 = Math.min(imH, cy + h / 2);
        boxes.push({ x1, y1, x2, y2, score: bestScore, label: COCO_CLASSES[bestCls] });
        anchorIdx++;
      }
    }
  }
  return boxes;
}

export function nms(boxes, iouThresh = IOU) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept = [];
  while (sorted.length) {
    const best = sorted.shift();
    kept.push(best);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].label === best.label && iou(best, sorted[i]) > iouThresh) sorted.splice(i, 1);
    }
  }
  return kept;
}
function iou(a, b) {
  const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = x * y;
  const ua = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return ua <= 0 ? 0 : inter / ua;
}

/* ── faces (native API, honest fallback) ──────────────────────────────────── */
export function initFaceDetector() {
  try { faceDetector = window.FaceDetector ? new FaceDetector({ fastMode: false, maxDetectedFaces: 4 }) : null; } catch { faceDetector = null; }
  return !!faceDetector;
}

export async function detectFaces(video) {
  if (!faceDetector || !video || video.readyState < 2) return [];
  try {
    const faces = await faceDetector.detect(video);
    return faces.map(f => ({
      x: f.boundingBox.x, y: f.boundingBox.y,
      w: f.boundingBox.width, h: f.boundingBox.height,
      landmarks: f.landmarks?.length || 0,
    }));
  } catch { return []; }
}

/* ── OCR ──────────────────────────────────────────────────────────────────── */
export async function initOcr(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  if (!window.Tesseract) throw new Error('OCR engine not loaded');
  onProgress && onProgress(20, 'Loading OCR engine');
  tesseractWorker = await Tesseract.createWorker('eng', 1, {
    workerPath: 'vendor/tesseract/worker.min.js',
    corePath: 'vendor/tesseract/core.wasm.js',
    langPath: 'vendor/tessdata',
    gzip: true,
  });
  onProgress && onProgress(80, 'OCR model ready');
  return tesseractWorker;
}

export async function ocrFrame(video, onProgress) {
  const worker = await initOcr(onProgress);
  const c = document.createElement('canvas');
  const scale = 1000 / video.videoWidth;
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  const { data } = await worker.recognize(c);
  return (data.text || '').trim();
}

/* ── scene analysis (real pixel statistics) ───────────────────────────────── */
export function analyzeScene(video) {
  if (!video || video.readyState < 2) return null;
  const c = document.createElement('canvas');
  c.width = 160; c.height = 120;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, 160, 120);
  const d = g.getImageData(0, 0, 160, 120).data;

  let lum = 0, edge = 0;
  const hueBuckets = [0, 0, 0, 0, 0, 0, 0, 0];
  const hueNames = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
  const N = 160 * 120;
  for (let i = 0; i < N; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx > 24 && mx - mn > 18) {
      let h = 0;
      const delta = mx - mn;
      if (mx === r) h = ((gg - b) / delta) % 6;
      else if (mx === gg) h = (b - r) / delta + 2;
      else h = (r - gg) / delta + 4;
      h = (h * 60 + 360) % 360;
      hueBuckets[Math.floor(h / 45) % 8]++;
    }
    if (i % 160 > 0 && i >= 160) {
      const l = lumIdx(d, i - 160), r2 = lumIdx(d, i - 1);
      edge += Math.abs(l - r2);
    }
  }
  lum /= N;
  const brightness = lum > 150 ? 'bright' : lum > 80 ? 'moderate' : 'dim';
  const total = Math.max(1, hueBuckets.reduce((a, b) => a + b, 0));
  const colors = hueBuckets.map((c, i) => ({ name: hueNames[i], frac: c / total }))
    .filter(x => x.frac > 0.08).sort((a, b) => b.frac - a.frac).map(x => x.name);

  // motion vs previous frame
  let motion = 0;
  const gray = new Uint8Array(N);
  for (let i = 0; i < N; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 | 0;
  if (prevGray) {
    let diff = 0;
    for (let i = 0; i < N; i += 2) diff += Math.abs(gray[i] - prevGray[i]);
    motion = diff / (N / 2) / 255;
  }
  prevGray = gray;

  return { brightness, colors: colors.length ? colors : ['neutral'], motion: Math.min(1, motion * 3), edgeDensity: Math.min(1, edge / N / 40) };
}

function lumIdx(d, i) { return 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; }

/** Lightweight "text-like region" heuristic (for the scan HUD, honestly labeled). */
export function textRegions() {
  const sc = State.get('vision').scene;
  return sc && sc.edgeDensity > 0.22;
}
