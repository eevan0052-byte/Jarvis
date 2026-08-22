# JARVIS — Personal AI Operating Layer for the Galaxy Z Fold4

A real, functional multimodal AI assistant — voice + vision + memory +
context + device intelligence + automation + privacy — with a cinematic
HUD and a state-reactive AI core. Two deliverables:

```
jarvis-web/      Live system (runs right now in your browser) — the full
                 experience: real voice, real on-device camera AI, memory,
                 automation, privacy center. Also serves as the reference
                 implementation and test harness for shared logic.

jarvis-android/  Native Kotlin + Jetpack Compose app for the Z Fold4 —
                 fold-aware layouts, ML Kit vision, SpeechRecognizer/TTS,
                 Room memory, Keystore security. Build in Android Studio.
```

## Run the live system

```bash
cd jarvis-web
npm start            # → http://localhost:8787  (zero dependencies)
npm test             # 46 unit tests (NLU, memory, context, automation,
                     #    providers, vision postprocessing, crypto)
```

**Browser requirements:** Chrome/Edge for voice recognition (Web Speech API),
camera, and battery telemetry. Firefox/Safari: typed commands + everything
else work; voice is honestly marked unavailable.

**Fold simulation:** the web companion has COVER / UNFOLD / AMBIENT buttons
(top right, or press `F`) that reflow the interface the way the Fold4 does
— the native app drives this with the real hinge via WindowInfoTracker.

## What actually works (verified)

| System | How | Proof |
|---|---|---|
| **Vision: object detection** | YOLO11n (COCO 80) via ONNX Runtime WASM — vendored, on-device, no cloud | End-to-end test: real dog photo → `dog 92%` box via the actual JS decode pipeline |
| **Vision: OCR** | Tesseract.js + eng-fast model, vendored | on-demand "Read text" in Vision Mode |
| **Vision: face detection** | native FaceDetector API where the platform exposes it | feature-detected; honest fallback otherwise |
| **Scene analysis** | real pixel statistics: brightness, dominant tones, motion, edge density | labeled as statistics |
| **Voice** | Web Speech recognition + platform TTS + WebAudio VAD waveform | push-to-talk orb, wake word (opt-in), interruptible speech |
| **Speaker recognition** | acoustic voiceprint (pitch/energy/spectral) — labeled EXPERIMENTAL, local-only, encrypted at rest | enrollment + verification flows in Privacy Center |
| **Face recognition** | landmark-geometry templates — labeled EXPERIMENTAL, personalization only | enrollment via FaceDetector landmarks |
| **Device telemetry** | battery, charging, network type, storage, RAM, cores, fold state | System Command Center — REAL vs UNAVAILABLE labeled |
| **Weather** | Open-Meteo, no key; geolocation or manual city; stale-cache marked | briefing + voice queries |
| **Memory** | categories, CRUD, search, pin, export/import, usage stats | Memory Center |
| **Automation** | IF→THEN rules, confirm-first, auto-run opt-in, templates | Automation engine + editor |
| **Reminders** | scheduled locally + system notifications | "remind me to … in 30 minutes" |
| **AI providers** | local NLU (offline) + OpenAI-compatible/Anthropic/Gemini (BYOK, AES-GCM vault) | Settings → AI Engine; graceful fallback verified by tests |
| **Command chaining** | "check X, tell me Y, and start focus" → 3 sequential intents | NLU tests |
| **Offline mode** | local voice/vision/memory keep working; cloud marked unavailable | network-status handling + SW cache |
| **Privacy** | live permission states, audit log, delete-everything, no tracking | Privacy Center |

**Honest limitations (never faked):** the local engine cannot answer
open-domain trivia — it says so and routes to your cloud key if configured;
camera frames are never uploaded; biometrics are acoustic/geometry profiles,
not security-grade; browser APIs don't expose temperature/sensor lists (the
Android build does via BatteryManager/SensorManager).

## AI provider architecture (no hard-coded vendor)

```
AiProvider { id, label, kind, configured(), chat(system, messages, context) }
 ├─ Local NLU Engine      — on-device, offline, zero config
 ├─ OpenAI-compatible     — endpoint+model configurable (OpenAI/OpenRouter/Ollama…)
 ├─ Anthropic             — Claude models
 └─ Google Gemini         — Gemini models
```

Keys are encrypted at rest (WebCrypto AES-256-GCM vault in the web app;
Android Keystore AES-256-GCM in the native app). Offline or unconfigured →
local engine with an honest fallback reason. No key is ever in source code.

## Architecture (web)

```
public/js/
├── main.js          boot orchestration
├── state.js         mode machine + event bus
├── core-renderer.js AI core (canvas): 7 states, particles/rings/neural mesh,
│                    quality scaling on battery + measured fps
├── nlu.js           intent engine (33 intents, slots, chaining)   [tested]
├── providers/       abstraction + local composer + 3 cloud adapters [tested]
├── memory.js        adaptive memory + usage stats                 [tested]
├── context.js       neural context engine + predictive layer      [tested]
├── automation.js    safe IF→THEN engine, confirm-first            [tested]
├── vision.js        camera → ONNX/YOLO11n → decode → NMS; OCR; faces; scene [tested]
├── speech.js        STT/TTS/wake word
├── speaker.js       acoustic voiceprint (enroll/verify/delete)
├── faceid.js        landmark templates (encrypted)
├── device.js        real platform telemetry
├── weather.js       Open-Meteo
├── privacy.js       capabilities, audit log, wipe
├── secrets.js       AES-256-GCM key vault                        [tested]
└── ui/              boot, hud, conversation, panels, vision overlay,
                     command palette, onboarding, settings, …
```

## Testing

```bash
cd jarvis-web && npm test
# 46 tests: NLU intents/slots/chains, memory CRUD/search/stats,
# context assembly + predictions, automation conditions + throttle,
# provider registry fallbacks, local response grounding,
# YOLO decode + NMS (incl. real-model output fixture),
# vault crypto roundtrip.
```

Android: `./gradlew test` runs the same NLU corpus, speaker-feature purity
tests and automation rule tests in Kotlin (see `jarvis-android/README.md`).

## Keyboard

| Key | Action |
|---|---|
| `Ctrl/Cmd + K` | command palette |
| `F` | toggle cover/unfolded |
| `Esc` | close panels / palette |
| Tap orb ◈ | speak a command |

## Roadmap notes

- **Relay mode:** `server.js` includes `/api/proxy/*` endpoints + an
  encrypted server-side config (AES-256-GCM `server-config.enc.json` +
  `server-config.key`) so keys never touch the browser in team deployments.
- **Android parity:** the NLU, context, automation, speaker-feature and
  response-composer logic are ported 1:1 to Kotlin and tested against the
  same corpus.
