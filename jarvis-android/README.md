# JARVIS for Samsung Galaxy Z Fold4 — Android

Native Kotlin + Jetpack Compose implementation of the JARVIS personal AI
operating layer, optimized for the Fold4's cover + inner foldable screens.

> The full system is described in the repository root `README.md`. This file
> covers the Android build specifically.

## Build

Requirements: Android Studio (Koala or newer), JDK 17, Android SDK 35.

```bash
cd jarvis-android
# open in Android Studio and run on a Z Fold4 (or any API 26+ device/emulator)
./gradlew assembleDebug          # APK
./gradlew test                   # JVM unit tests (NLU, speaker features, automation)
./gradlew connectedAndroidTest   # instrumented tests (on device)
```

First build downloads ML Kit + CameraX artifacts; the on-device models
(object detection, face, text) are bundled by Play Services / shipped in the
APK automatically by ML Kit.

## CI cloud build (GitHub Actions) — no PC needed

The `.github/workflows/android-build.yml` workflow compiles the APK in the
cloud and publishes it as a downloadable artifact:

1. Create a GitHub repository and push this project (see root README /
   Termux instructions below).
2. **Actions tab → workflow "Android CI" → Run workflow** (or push to main).
3. When the run finishes: **Artifacts → jarvis-debug-apk** → download →
   unzip → tap `app-debug.apk` on the Fold4 → allow "install unknown apps"
   for the Files/Browser app.

Termux quick start (F-Droid build recommended, not the Play Store one):

```bash
pkg update && pkg upgrade
pkg install git openssh
termux-setup-storage                    # gives access to ~/storage/downloads
git config --global user.name "You"
git config --global user.email "you@example.com"
ssh-keygen -t ed25519 -C "you@example.com"   # Enter ×3
cat ~/.ssh/id_ed25519.pub               # → GitHub → Settings → SSH keys → New
cd ~/storage/downloads
git clone git@github.com:YOU/jarvis.git
cd jarvis
# copy jarvis-web/ and jarvis-android/ from the ZIP into this folder, then:
git add -A && git commit -m "Initial import" && git push -u origin main
```

Editing on the Fold4: press `.` on the GitHub repo page (or open
`github.dev/YOU/jarvis`) — a full VS Code in the browser with Kotlin syntax
highlighting, Git panel, commit & push. The Fold4 inner screen is big enough
for comfortable editing.

Notes: the debug APK is signed with the public debug keystore (fine for
personal testing; release signing needs your own keystore). Instrumented
tests (`androidTest`) need an emulator/device — CI runs the JVM test suite.
ML Kit models download through Play Services on the phone on first use.

## What is REAL vs UNAVAILABLE (honest matrix)

| Capability | Implementation | Status |
|---|---|---|
| Voice commands | `SpeechRecognizer` (platform recognizer) | REAL — if the device has no recognizer, mic is disabled and the UI says so |
| Text-to-speech | `TextToSpeech` | REAL — interruptible, state-driven core animation |
| Voice level meter | `onRmsChanged` | REAL |
| Wake word | continuous recognition loop for "Jarvis" | REAL but opt-in (battery cost, disclosed) |
| Object detection | ML Kit object detector (COCO, on-device) | REAL |
| Face detection | ML Kit face detector + landmarks | REAL |
| OCR | ML Kit text recognizer (latin) | REAL |
| Scene analysis | YUV luminance/motion statistics | REAL (statistics, not semantic labels — labeled as such) |
| Speaker recognition | acoustic voiceprint (pitch/energy/spectral features from PCM) | EXPERIMENTAL — explicitly labeled "not a security biometric" |
| Face recognition | landmark-geometry templates | EXPERIMENTAL — personalization only, not authentication |
| Battery / charging | `BatteryManager` | REAL |
| Storage | `StatFs` | REAL |
| RAM | `ActivityManager.MemoryInfo` | REAL (total only; per-process via `Debug.getMemoryInfo`) |
| Network | `ConnectivityManager` | REAL |
| Temperature | thermal framework where exposed | REAL or UNAVAILABLE (device-dependent, labeled) |
| Fold state | androidx `WindowInfoTracker` / `FoldingFeature` | REAL |
| Weather | Open-Meteo (no key) | REAL when online; cached stale otherwise (labeled) |
| Memory | Room (SQLite), searchable/editable/deletable | REAL |
| Routines / automation | Room rules + WorkManager evaluator, confirm-first | REAL |
| Reminders | Room + notifications (POST_NOTIFICATIONS gated) | REAL |
| Provider keys | Android Keystore AES-256-GCM | REAL — never hard-coded |
| Biometric templates | Keystore-encrypted JSON | REAL — never transmitted |
| Cloud LLM | OpenAI-compatible / Anthropic / Gemini via OkHttp | REAL when user supplies a key; falls back to local NLU honestly |
| Calendar/Contacts | permission-gated reads for briefing/emergency info | OPT-IN |
| App screen analysis | accessibility APIs | NOT IMPLEMENTED by default — enabled only by explicit user action; no covert monitoring |

## Architecture (module boundaries)

```
app/src/main/java/com/jarvis/fold4/
├── JarvisApp.kt                 # composition root
├── MainActivity.kt              # fold-aware shell (WindowInfoTracker)
├── MainViewModel.kt             # multimodal pipeline orchestrator
├── core/        JarvisState, Mode        # state machine (StateFlow)
├── ai/          AiProvider, ProviderRegistry, LocalNluEngine,
│                ResponseComposer, CloudLlmProviders
├── voice/       VoiceEngine, TtsEngine
├── vision/      VisionEngine (CameraX + ML Kit)
├── biometrics/  SpeakerProfiles, FaceProfiles, BiometricCrypto
├── memory/      Room db, dao, repository, preferences
├── context/     ContextEngine, ContextSnapshot, WeatherService
├── automation/  AutomationEngine, AutomationWorker
├── device/      SystemInfoCollector
├── security/    SecretStore (Keystore AES-GCM)
├── privacy/     PrivacyCenter, AuditLogger
├── notifications/ Notifier
├── util/        Feedback (haptics + synthesized sounds)
└── ui/          theme, components (HudCore…), screens
```

UI never talks to devices/services directly; it observes `JarvisCore.state`
and the ViewModel — strong separation per the spec.

## Security notes

- Provider API keys: encrypted with an Android-Keystore AES-256-GCM key;
  nothing hard-coded; nothing logged.
- Biometric templates: same Keystore-backed encryption; delete buttons in
  Privacy Center.
- All network calls use HTTPS (OkHttp default); cleartext disabled.
- Minimal permissions, each requested with an explanation; every permission
  visible and revocable in the Privacy Center.

## Known platform limitations (not hidden)

- ML Kit object labels are COCO's 80 classes — it cannot identify arbitrary
  products or plants; the UI says so.
- Speaker/face recognition are acoustic/geometry profiles, not biometrics.
- No silent background camera or mic: Vision Mode only while visible.
