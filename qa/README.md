# QA — independent verification

These scripts are for local verification only; test fixtures and screenshots are gitignored.

## API end-to-end

```powershell
# stack must be running with FACE_PROVIDER=human (docker compose up -d)
node scripts/e2e-api.mjs
```

Covers admin login, health, student self-registration with face enrollment, face match/same-person/
impostor rejection, check-in, 60 s duplicate guard, manual correction, check-out, repeat guard,
students/attendance/absentees/CSV/reports/dashboard, and cleanup. It downloads three tiny portraits
from the public face-api.js examples into `qa/fixtures/` on first run.

## Browser UI end-to-end + screenshots

```powershell
cd qa
npm install
npx playwright install chromium
node make-fake-camera.mjs          # creates fixtures/face-camera-amy1.y4m
node ui-check.mjs                  # requires admin at localhost:3000, API at localhost:3001
```

The browser is launched with Chromium's fake webcam device streaming the generated Y4M, so the
student registration webcam flow is exercised for real. Screenshots are written to
`qa/screenshots/`. Set `ADMIN_URL` for a different admin host and `FACE_VIDEO` to use a different
generated video (e.g. a different test face to avoid the duplicate-face guard):

```powershell
$env:FACE_SRC='leonard1.png'; node make-fake-camera.mjs
$env:FACE_VIDEO="$PWD/fixtures/face-camera-leonard1.y4m"; node ui-check.mjs
```

## Manual evidence from final verification

- API E2E: 22/22 passed on the Node 26.13.0 backend with the human face provider
  (same-person 0.7934 cosine, impostor rejected, check-out flow, reports).
- Same E2E **through the port-3000 proxy** (`API_URL=http://localhost:3000/api`): 22/22, covering
  JSON auth, multipart face upload, CSV and reports through the same-origin Android route.
- Browser UI: 9/9 passed on Next.js 16.4.5; admin pages, webcam registration with real server-side
  face enrollment, no console/HTTP errors. The newly enrolled face was then recognized by the kiosk
  at 0.8566.
- Android: signed release APK installed on the emulator, default setup URL
  `http://192.168.128.140:3000/api`, Test Connection through the port-3000 proxy returned *Demo
  Kiosk · Main Entrance*.
- Android live face guidance: ML Kit runs on CameraX frames; with the emulator's face-less virtual
  camera it shows **No face detected** and keeps Scan disabled (face-fit heuristics unit-tested
  13/13).
- Android face registration: setup → **Register a student face** → STU001 login succeeded through
  the proxy and showed the guided camera screen. Enrolment was verified through the same API
  (`/student/enroll-face`); the enrolled face then matched at the kiosk with confidence 0.7934.
- Release pipeline: `scripts/build-release.ps1` builds/tags the Node 26 images, signed APK and AAB,
  and verifies the APK signature (`CN=SchoolCheck Release`, v2).

The test fixtures are from the public face-api.js examples and are not part of the product.
