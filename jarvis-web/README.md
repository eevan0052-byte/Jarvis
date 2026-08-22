# JARVIS — live system (web companion + reference implementation)

The full functional system, running entirely in your browser. This is the
reference implementation whose pure logic (NLU, context, automation, speaker
features, response composition) is ported 1:1 into the Kotlin Android app.

## Run

```bash
npm start     # http://localhost:8787 — zero npm dependencies
npm test      # 46 unit tests
```

## What runs where

- **On-device (no network needed):** YOLO11n object detection (ONNX Runtime
  WASM, vendored in `public/vendor/`), Tesseract OCR (vendored), face
  detection (platform FaceDetector API), speaker/face profiles (local,
  encrypted at rest), memory, automation, reminders, device telemetry,
  local NLU, TTS/STT (platform engines).
- **Network (no key):** Open-Meteo weather, Wikipedia lookups in Vision Mode.
- **Optional BYOK:** OpenAI-compatible / Anthropic / Gemini in
  Settings → AI Engine. Keys encrypted via the AES-256-GCM vault.
- **Server (Node, zero deps):** static hosting + optional relay mode for
  team deployments (`/api/proxy/*` with an encrypted server-side config —
  see `server.js` header comment).

## Testing the fold

Top-right COVER / UNFOLD / AMBIENT buttons (or press `F`) — the interface
reflows exactly as the native app does when the hinge state changes.

## Honest limitations

- Voice recognition requires Chrome/Edge (Web Speech API). Other browsers:
  typed commands + everything else; voice marked unavailable, never faked.
- The local engine does not answer open-domain questions — it tells you and
  offers the BYOK cloud path.
- Speaker/face recognition are acoustic/geometry profiles, not security
  biometrics — labeled in the Privacy Center.
- If the app is embedded in a sandboxed frame, camera/mic may need to be
  granted in the host — the app detects this and shows the exact reason.
