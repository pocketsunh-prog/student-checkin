# SchoolCheck Kiosk (Android)

Android kiosk app for the student check-in / check-out system. The kiosk is deliberately
"thin": it captures a JPEG with CameraX, uploads it to the school server, and shows the
recognition result. All face detection, matching and attendance rules live in the backend
(see `docs/ARCHITECTURE.md`).

- **Stack:** Kotlin, Jetpack Compose (Material 3), CameraX 1.4, OkHttp 4, kotlinx.serialization,
  DataStore Preferences, coroutines. Single activity, no navigation library.
- **SDK:** `minSdk 26`, `compileSdk 35`, `targetSdk 35`.
- **Package / app name:** `com.schoolcheck.kiosk` / **SchoolCheck Kiosk**.

## What it does

| Screen / behavior | Details |
|---|---|
| Setup (first launch, or gear icon) | Editable server base URL + device key. **Test connection** calls `GET /api/kiosk/health` with `X-Device-Key` and shows the device name/location and whether the face service is ready. Saved in DataStore. URL normalisation: missing `http://` is added, trailing `/` stripped, `/api` appended when the user only typed `host:port`. |
| Kiosk camera | Front camera preview by default (flip button for rear), face-oval guide, one huge **SCAN** button. Captures JPEG **in memory** (`ImageCapture.takePicture` callback) — never written to disk or the gallery. |
| Scan upload | `POST /api/kiosk/verify` as `multipart/form-data` with field `image` and header `X-Device-Key`. `mode` is omitted so the server uses its AUTO check-in/out logic. Only one upload can be in flight; the Scan button is disabled while checking. |
| Result overlay | ✓ Checked in / out, ⚠ Already checked in/out, LATE + late minutes, PRESENT, student name / ID / class, confidence and server `message`. Unmatched: `NO_FACE`, `MULTIPLE_FACES`, `NO_MATCH` with friendly text. HTTP errors (401, 413, 422, 429, 5xx, 503 face service warming up) and network failures are mapped to plain-language messages, with a **Try again** retry for transport failures. Successful/unmatched results auto-return to the camera after ~5 s; failures stay until dismissed. |
| Heartbeat & status | `POST /api/kiosk/heartbeat` every 60 s while the kiosk screen is visible. Badge: **Online** / **Offline** / **Connecting…** / **Key rejected** (401). |
| Recent scans | Top-right **Recent** opens the last 10 successful scans (time, name, student ID/class, action, LATE/on-time). Stored on the device as metadata only — no photos, no descriptors. |
| Kiosk hardening | Portrait, immersive fullscreen, screen kept on (`FLAG_KEEP_SCREEN_ON`), large touch targets, no bottom navigation. Settings behind the gear icon + confirmation dialog (demo; no PIN). |
| Permissions | `CAMERA` requested with an in-app rationale before the system prompt; if denied, the setup/settings screen stays reachable and an "Open app settings" action is offered. `INTERNET` for the API. |

## Build

Prerequisites: **JDK 17+** (tested with OpenJDK 21) and an Android SDK with platform 35 /
build-tools 35. Gradle itself is **not** required — the committed wrapper downloads it.

```powershell
cd android
.\gradlew.bat assembleDebug
```

- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Unit tests (URL normalisation/validation): `.\gradlew.bat testDebugUnitTest`
- Install on a connected device/emulator: `adb install -r app\build\outputs\apk\debug\app-debug.apk`
- Launch: `adb shell am start -n com.schoolcheck.kiosk/.MainActivity`

`local.properties` must point at the SDK and is intentionally **gitignored**:

```properties
sdk.dir=C\:\\Android\\Sdk
```

If SDK components are missing, install them with `sdkmanager "platforms;android-35" "build-tools;35.0.0"`.

## Configuring the server

On first launch the setup screen opens. Defaults:

- Server base URL: `http://10.0.2.2:3001/api`
- Device key: `demo-kiosk-key-12345` (dev seed from `docs/API.md` §8)

| Where the app runs | Server base URL to enter |
|---|---|
| Android emulator (backend on the same PC) | `http://10.0.2.2:3001/api` (default; `10.0.2.2` = host loopback) |
| Physical phone/tablet on the school LAN | `http://<PC-LAN-IP>:3001/api`, e.g. `http://192.168.1.20:3001/api` |

Find the PC's LAN IP with `ipconfig` (IPv4 Address). The backend must listen on `0.0.0.0`
(not just `127.0.0.1`) and Windows Firewall must allow inbound TCP 3001 for the phone to
reach it. Both devices must be on the same network.

Tap **Test connection** before saving: it hits the real health endpoint and will tell you if
the URL is wrong (`Can't reach the server…`), the key is wrong (`Device key rejected…`), or
the face models are still loading (`Face service is still starting…`).

### Creating / rotating the device key

Kiosk devices authenticate with a per-device API key, not a user login:

1. Admin portal → **Devices** (or `POST /api/devices` with `{ name, location }`). The new
   `apiKey` is returned **once** — copy it straight into the kiosk setup screen.
2. Each kiosk should have its own key/device row so `lastSeenAt`, online status and
   revocation are per device.
3. To rotate: admin portal → Devices → **Rotate key** (or `POST /api/devices/:id/rotate-key`).
   The old key is invalid immediately, so update the kiosk right away: gear icon →
   **Open settings** → paste the new key → **Test connection** → **Save**.
4. If a tablet is lost, rotate/delete its device row; that kiosk stops authenticating (the
   badge turns **Key rejected** and scans return `401 UNAUTHORIZED`).

## Architecture

```
app/src/main/java/com/schoolcheck/kiosk/
├─ MainActivity.kt              immersive fullscreen + keep-screen-on, hosts Compose
├─ SchoolCheckApplication.kt    tiny manual DI graph (repositories + OkHttp)
├─ data/
│  ├─ KioskApi.kt               OkHttp calls for the 3 kiosk endpoints, JSON parsing, ApiException
│  ├─ KioskRepository.kt        facade over API + settings
│  ├─ SettingsRepository.kt     DataStore: base URL, device key, configured flag
│  ├─ ScanHistoryRepository.kt  DataStore: last 10 scan results as JSON (metadata only)
│  └─ model/Models.kt           API + persistence models (kotlinx.serialization)
├─ ui/
│  ├─ AppRoot.kt / RootViewModel.kt          setup ↔ kiosk switching
│  ├─ setup/SetupScreen.kt, SetupViewModel.kt
│  ├─ kiosk/KioskScreen.kt                   camera preview, guide, controls, dialogs
│  ├─ kiosk/KioskViewModel.kt                heartbeat, upload guard, result lifetime, history
│  ├─ kiosk/CameraPreview.kt                 CameraX controller (preview + in-memory JPEG)
│  ├─ kiosk/ResultOverlay.kt, HistoryPanel.kt, ScanLabels.kt
│  └─ theme/                                 Material 3 dark kiosk theme + large type
└─ util/UrlUtils.kt, Errors.kt               URL normalisation/validation, friendly errors
```

State handling: `ViewModel` + `StateFlow`, collected with `collectAsStateWithLifecycle`.
Network calls are suspend functions on `Dispatchers.IO`, errors surface as `ApiException`
(contract error code + HTTP status) or `IOException`, and are rendered through
`Throwable.toFriendlyMessage()`.

## API contract used (docs/API.md §5 only)

| Call | Notes |
|---|---|
| `GET /api/kiosk/health` | `X-Device-Key`; parses `{success,data:{device,serverTime,faceServiceReady}}` (also tolerates a bare payload). |
| `POST /api/kiosk/verify` | `X-Device-Key`; multipart field `image` (JPEG). Parses `{success,data:{matched,action,confidence,student,attendance,message}}`; unmatched scans are HTTP 200 with `matched:false` + `reason`. No `mode` field sent (server AUTO). |
| `POST /api/kiosk/heartbeat` | `X-Device-Key`, empty body, every 60 s. Parses `{success,data:{ok,serverTime}}` or a bare payload. |

No other endpoints are called, and there is **no manual student-ID fallback** — the v1 API
has no such route. If a face is not enrolled, the kiosk tells the student to see the office.

## Security notes (read before deploying)

- **The device key is a bearer credential.** Anyone who extracts it can submit scans as this
  kiosk. Keep the tablet locked down, rotate keys per device on loss, and don't reuse one key
  across many kiosks. It is the only secret stored by the app.
- **Cleartext HTTP is enabled for local development only** (`res/xml/network_security_config.xml`,
  `cleartextTrafficPermitted="true"`). This is required because the demo backend speaks plain
  HTTP on the LAN. For production: serve the API over HTTPS and either set
  `cleartextTrafficPermitted="false"` or move the permissive config to a debug-only source set.
- **Photos are never stored on the device.** Capture returns JPEG bytes in memory, they are
  uploaded immediately, and no file/gallery entry is created. The recent-scans list keeps
  only name / student ID / class / action / status / confidence for the last 10 scans.
- No biometric descriptors are computed or stored on the device — recognition is server-side.
- `android:allowBackup="false"` so the stored URL/key are not swept into cloud backups.
- For real kiosk deployment additionally consider Android **device-owner / LockTask** mode,
  disabling USB debugging, and hiding notifications.

## Verification performed (emulator)

Verified on 2026-11-05 with a headless `Pixel_10` AVD (Android 37, x86_64, emulated front camera)
and a **local stub server** implementing the documented `docs/API.md` §5 response shapes on port
3101. The stub was used only for this smoke test; the real backend was not running during the test.

| Check | Result |
|---|---|
| `.\gradlew.bat assembleDebug` | BUILD SUCCESSFUL (Gradle 8.11.1, AGP 8.7.3, Kotlin 2.0.21) |
| `.\gradlew.bat testDebugUnitTest` | 7/7 tests pass (URL normalisation + validation) |
| Install + cold launch on API 37 | Launches to kiosk (already configured), no crash |
| Setup screen | Renders; normalised-URL preview correct (`10.0.2.2:3101` → `http://10.0.2.2:3101/api`) |
| Test connection (success) | "Connected" card with device name/location + server time (success envelope parsed) |
| Wrong device key (401) | "Connection failed — Device key rejected…" (friendly mapping) |
| Save & start | Persisted to DataStore (verified on the device preferences file); kiosk opens |
| Kiosk screen | Front-camera preview, face oval, big Scan button, Online badge |
| Scan upload | `POST /api/kiosk/verify` multipart with `image` field (~56 KB JPEG) and `X-Device-Key`; stub returned CHECK_IN/LATE, CHECK_OUT, NO_MATCH payloads — each rendered correctly |
| Duplicate upload guard | 3 rapid Scan taps → exactly 1 verify request |
| Network failure + retry | Stub stopped → "Scan not sent" + **Try again**; after restart, retry re-sent the retained in-memory frame and succeeded |
| Heartbeat | ~60 s cadence while kiosk visible; Online badge; stops while settings are open; resumes on return |
| Recent scans | Panel lists last 10 (time, name, ID/class, action, LATE) and survives app restart |
| Settings from kiosk | Gear → confirmation dialog → setup with saved values; Cancel returns to kiosk |
| Camera permission | Rationale dialog → Not now → denied panel with "Open app settings"; after granting, camera works |
| Immersive / keep-screen-on | No system bars in screenshots; flag set in `MainActivity` |

Evidence: `screenshots/setup-form.png`, `setup-connected.png`, `setup-badkey.png`,
`kiosk-online.png`, `result-checkin.png`, `result-checkout.png`, `result-unmatched.png`,
`recent-scans.png`, `settings-dialog.png`, `permission-rationale.png`, `permission-denied.png`,
`error-retry.png`, `retry-success.png`.

**Not verified:** the real backend (recognition threshold, enrollment, attendance writes) and
real face matching — the emulator's virtual camera has no enrolled face. That must be tested on
a physical tablet/phone with a student enrolled through the real backend. The received MIME
`image` part was accepted by the stub; server-side face detection was not exercised.

## Known limitations

- v1 has no liveness/anti-spoofing (a printed photo could pass) — backend limitation, documented
  in `docs/ARCHITECTURE.md`.
- The oval is a static on-screen guide; face detection happens server-side after upload.
- One frame per scan (no burst), matching backend v1.
- Portrait orientation only, single activity, demo-level settings protection (confirmation
  dialog, no PIN).
- Cleartext HTTP is a dev convenience, not production-ready.
