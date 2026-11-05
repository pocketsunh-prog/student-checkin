# SchoolCheck — Student Check-In / Check-Out System

A full-stack attendance system for schools: students enroll once with their face, school phones/tablets
act as face-recognition kiosks, and administrators get live attendance plus absence/late reports.

**Stack:** Node.js + Express + Prisma + MySQL 8 (Docker) · Next.js 15 admin/student web · Android
(Kotlin + Compose + CameraX) kiosk · face recognition with `@vladmandic/human` + TensorFlow.js.

---

## 1. What it does

| Requirement | Implementation |
|---|---|
| 1. Student creates an account with student ID as key, DOB, sex, class, form and a face key | `POST /api/auth/student/register` (multipart). `students.student_id` is the primary key; `face_descriptor` stores the 1024-D face embedding. Public page `/register`. |
| 2. Many school phones use face recognition for check-in/out and save to DB | Android kiosk app authenticates with a per-device API key and uploads a camera frame to `POST /api/kiosk/verify`; backend matches the face and writes `attendance` + `scan_events`. |
| 3. Admin system can view/report absences and late arrivals | Next.js admin: dashboard, attendance log, date-range reports, absentees/late, CSV export, manual correction. |
| 4. Backend Node.js, frontend Next.js, mobile Android, MySQL on Docker | `backend/`, `admin/`, `android/`, `docker-compose.yml`. |

**Check-in logic:** first successful face scan of the day creates a check-in (status `PRESENT` or
`LATE` using the school's start time + grace period); the next scan after 60 s checks the student out.
Absence is derived: active students with no check-in on a school day are reported absent. A scan log
records every attempt, including unrecognised faces.

---

## 2. Quick start (Docker)

Requirements: Docker Desktop (Linux containers), ~4 GB free RAM, internet for the first build.

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
```

First build downloads Node/Android-unrelated dependencies and the TensorFlow.js native addon; expect
3–8 minutes. MySQL migrations and seed data run automatically on backend start.

| Service | URL |
|---|---|
| Admin / student web | http://localhost:3000 |
| API | http://localhost:3001/api |
| API health | http://localhost:3001/api/health |
| MySQL | `localhost:3307` (db `checkin`, user `checkin`) |

### Demo accounts (seed)

| Role | Credentials |
|---|---|
| Admin | `admin@school.edu` / `Admin@12345` |
| Kiosk device key | `demo-kiosk-key-12345` (device: *Demo Kiosk*) |
| Demo students | `STU001` … `STU012` / `Student@12345` (no faces until enrolled) |

The seed also creates realistic attendance for the last seven school days, so the dashboard and
reports are populated immediately. Demo students deliberately ship **without face data** (no real
student photos are included): enroll one at **Students → student → Enrol face**, or create a new
student at `/register`, before scanning at the kiosk.

Change these credentials in `.env` before any real deployment.

### Try it end-to-end

1. Open http://localhost:3000/login and sign in as admin. The dashboard will be mostly empty.
2. Open http://localhost:3000/register, create a student and capture a face with the webcam
   (or enroll a face later from the admin student page). The photo becomes the student's face key.
3. Start the Android kiosk (below), configure `http://10.0.2.2:3001/api` (emulator) or
   `http://<your-PC-LAN-IP>:3001/api` (physical phone) and the device key.
4. Scan the student's face: the kiosk shows **Checked in** (or **Late**), then scan again later to
   check out. Watch the admin dashboard/attendance log update.
5. Reports → pick a date range → export CSV.

You can also smoke-test the whole API with the human face provider:

```powershell
node scripts/e2e-api.mjs
```

---

## 3. Android kiosk app

Location: `android/`. Build:

```powershell
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

- **Emulator:** server `http://10.0.2.2:3001/api` (default).
- **Physical phone/tablet:** server `http://<PC-LAN-IP>:3001/api`; allow port 3001 through Windows
  Firewall; the device and PC must be on the same network.
- Device key is created/rotated in **Admin → Devices**. The seed key is `demo-kiosk-key-12345`.
- The app captures a JPEG only in memory and posts it; it does not save face images to the gallery.
- For production, use HTTPS and remove the cleartext-HTTP development allowance.

More detail: [android/README.md](android/README.md).

---

## 4. Architecture

```
Next.js admin/student (3000) ──┐
                               ├── REST /api (JWT or X-Device-Key) ──▶ Express API (3001)
Android kiosk phones ──────────┘                                      │ Prisma
                                                                      ▼
                                                              MySQL 8 (3307→3306)
```

- Face recognition is **server-side**: kiosks only capture and upload. This keeps many phones thin and
  descriptors off the devices.
- Enrollment: upload image → detect exactly one face → 1024-D FaceRes embedding → store JSON +
  SHA-256 in `students.face_descriptor`; duplicate faces are rejected.
- Scan: upload frame → extract embedding → cosine similarity vs. all active students → threshold
  match (default `0.60`, configurable) → attendance state machine → response to kiosk.
- Full docs: [API contract](docs/API.md), [database model](docs/DATABASE.md),
  [architecture notes](docs/ARCHITECTURE.md).

### Face recognition notes

- Models: BlazeFace detector, FaceMesh, FaceRes embedding (`backend/models/`, ~9 MB, downloaded from
  the MIT-licensed `@vladmandic/human-models` project).
- Default cosine threshold `0.60` is a conservative starting point. Tune
  `FACE_MATCH_THRESHOLD` / **Settings → Face match threshold** with the school's cameras and
  students: raise it if impostors match, lower it if genuine students are rejected.
- v1 has no anti-spoofing; a printed photo could pass. See "Production checklist".

---

## 5. Local development

### Database + backend

```powershell
docker compose up -d mysql

cd backend
Copy-Item ..\.env.example .env
# edit DATABASE_URL to mysql://checkin:checkinpass@127.0.0.1:3307/checkin
npm install --ignore-scripts      # native TFJS addon is only needed in Docker/Node 20
npx prisma migrate deploy
npm run seed
$env:FACE_PROVIDER = "mock"       # UI/dev only: no real face matching
npm run dev
```

Use `FACE_PROVIDER=human` locally only with Node 20 and the native `@tensorflow/tfjs-node` addon
installed; the Docker image (Node 20) is the supported way to run real recognition. Mock mode hashes
image bytes, so the same file matches itself and different files never match — useful for API/UI work.
See [backend/README.md](backend/README.md).

### Web app

```powershell
cd admin
Copy-Item .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

### Android

See section 3.

---

## 6. Tests

```powershell
# Backend typecheck/unit tests (mock face provider)
cd backend
npm run typecheck
npm run test

# Admin production build
cd ..\admin
npm run build

# End-to-end API test (requires docker compose stack with FACE_PROVIDER=human)
cd ..
node scripts/e2e-api.mjs

# Optional Playwright UI check (requires the stack + admin app on :3000)
cd qa
npm install
npx playwright install chromium
node make-fake-camera.mjs   # generates a fake webcam video from a downloaded test portrait
node ui-check.mjs
```

The Playwright check emulates a webcam, completes the public registration flow against the real
backend (including face enrollment), and screenshots every page. See [qa/README.md](qa/README.md).

### Verified in this build

- Backend: `typecheck`/`build` pass; **61/61** vitest+supertest tests pass against MySQL.
- API E2E with the **human** face provider: **22/22** checks (registration, same-person match
  0.7934, impostor rejected, check-in/check-out state machine, reports, CSV).
- Browser UI E2E: **9/9** checks, no console/HTTP errors; webcam registration face was then matched
  by the kiosk endpoint (confidence 0.8566).
- Android: `assembleDebug` + unit tests pass; app connects to the real backend on the emulator and a
  scan returns the live `NO_FACE` response from the API.
- Docker: MySQL → migrations → seed → API → face models all start healthy on a fresh volume.

The E2E script downloads three tiny portraits from the public `face-api.js` examples into
`qa/fixtures/` (gitignored) and exercises registration, face match, check-in, impostor rejection,
manual correction, check-out, reports and CSV.

---

## 7. Configuration

Copy `.env.example` → `.env` (Docker) and adjust:

| Variable | Default | Purpose |
|---|---|---|
| `MYSQL_*`, `MYSQL_PORT` | checkin/checkinpass/3307 | DB credentials and host port |
| `JWT_SECRET` | insecure demo value | **Change.** JWT signing key (≥32 random chars) |
| `CORS_ORIGINS` | localhost:3000 | Comma-separated allowed browser origins |
| `FACE_PROVIDER` | human | `human` or `mock` (tests/dev only) |
| `FACE_MATCH_THRESHOLD` | 0.60 | Cosine similarity threshold |
| `FACE_MODEL_PATH` | `/app/models` | Model directory in container |
| `SEED_ADMIN_*` | demo admin | Seeded admin account |
| `SEED_DEVICE_KEY` | demo key | Seeded kiosk key |
| `SEED_DEMO_STUDENTS` | true | Create STU001–STU012 |
| `NEXT_PUBLIC_API_URL` | http://localhost:3001/api | Baked into the web build (rebuild admin to change) |
| `SAVE_SCAN_IMAGES` | false | Persist scan frames for audit (sensitive) |

School start time, late grace, timezone, face threshold and school days are editable in
**Admin → Settings** (stored in `settings`).

---

## 8. Project layout

```
.
├─ backend/            Express + Prisma + face recognition, Dockerfile
│  ├─ models/          BlazeFace + FaceMesh + FaceRes
│  ├─ prisma/          schema, migration, seed
│  ├─ src/             app, routes, services, middleware, face providers
│  └─ tests/
├─ admin/              Next.js 15 admin + student portal, Dockerfile
├─ android/            Kotlin/Compose CameraX kiosk
├─ docs/               API.md, DATABASE.md, ARCHITECTURE.md
├─ scripts/            e2e-api.mjs, download-face-models.mjs
├─ qa/                 independent Playwright/API verification
├─ docker-compose.yml
└─ .env.example
```

---

## 9. Security & production checklist

This is a complete, working demo; before real student data:

- [ ] Unique `JWT_SECRET`; strong seed admin password; delete/rotate demo kiosk key.
- [ ] HTTPS everywhere (reverse proxy / TLS at the API and web app); remove Android cleartext HTTP.
- [ ] Restrict `CORS_ORIGINS` to the real admin domain.
- [ ] Do not expose MySQL publicly; change DB passwords; use Docker secrets.
- [ ] Encrypt biometric data at rest (disk/volume encryption or MySQL TDE); define consent,
      retention and deletion policy for face descriptors and photos.
- [ ] Add anti-spoofing / liveness (Human anti-spoof model or blink-and-turn challenge) and consider
      multi-sample enrollment for higher accuracy.
- [ ] Back up `mysql_data` and the uploads volume; test restore.
- [ ] Audit admin actions and restrict device registration to trusted staff.
- [ ] Put the API behind a reverse proxy with request size limits and rate limiting (built-in rate
      limits exist but are per-process).
- [ ] Review local privacy law (e.g. PDPO in Hong Kong) for biometric data of minors.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose ps` shows backend unhealthy | `docker compose logs backend` — first start loads TF models; give it 60 s. Check MySQL health. |
| `FACE_SERVICE_UNAVAILABLE` | Models missing / TFJS failed to load. Check `backend/models` and logs; rebuild backend. |
| Genuine face not recognised | Enroll in similar lighting, face camera straight-on with one face; lower threshold in Settings. |
| Impostor accepted | Raise threshold; avoid enrolling blurry/multi-person photos. |
| Android cannot connect | Emulator uses `10.0.2.2`; physical device uses PC LAN IP + firewall rule for 3001. Default server URL is editable in the app. |
| MySQL port 3307 in use | Change `MYSQL_PORT` in `.env`, then update local `DATABASE_URL` if developing outside Docker. |
| Admin shows network error | Check API URL baked into the build; rebuild `admin` if `NEXT_PUBLIC_API_URL` changed. |
| Face "already enrolled" on registration | Another student has a similar descriptor; check the person, or re-enroll the existing account from the admin page. |

---

## 11. License / credits

Face models from [@vladmandic/human-models](https://github.com/vladmandic/human-models) (MIT/Apache
model licenses; see that repository). Recognition pipeline uses
[@vladmandic/human](https://github.com/vladmandic/human) (MIT) and TensorFlow.js. Test fixtures in QA
come from the public face-api.js examples and are not shipped with the app.
