# Student Check-In System — Backend API

Node.js/TypeScript service for student check-in/out with **server-side face recognition**
(Human FaceRes 1024-D embeddings), MySQL 8 + Prisma, JWT auth for admins/students and
per-device API keys for kiosks.

Consumers:
- Admin/student web app (Next.js) — JWT
- Android kiosk app — `X-Device-Key` + multipart JPEG frames

The API contract lives in [`../docs/API.md`](../docs/API.md); the schema is documented in
[`../docs/DATABASE.md`](../docs/DATABASE.md).

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 26 LTS (Docker pins 26.13.0; 26.8+ runs locally) |
| HTTP | Express 5 + helmet + cors + express-rate-limit |
| Validation | zod |
| Auth | jsonwebtoken (HS256, 12 h) + bcryptjs (cost 12) |
| DB | MySQL 8 + Prisma 6 (`prisma migrate deploy`) |
| Uploads | multer (memory, 8 MB) + magic-byte validation (JPEG/PNG/WebP) |
| Face | `@vladmandic/human` 3.3.6 + `@tensorflow/tfjs-node` 4.22.0 + `sharp` 0.35.5 (EXIF orientation) |
| Tests | vitest + supertest (MySQL integration tests, `FACE_PROVIDER=mock`; 63 tests) |

---

## Quick start (local, mock face provider)

Mock mode needs **no TensorFlow** and works on Node 26. Install a Node 26 LTS release
([`.nvmrc`](../.nvmrc) pins 26.13.0 to match Docker; 26.8+ also works). Node 24 can run mock/UI
workflows but is below the declared engine version.

```bash
# from repo root: start MySQL on host port 3307
docker compose up -d mysql

cd backend
cp .env.example .env        # or keep the provided backend/.env
npm install --ignore-scripts   # skips the native tfjs-node build for mock-mode development
npx prisma generate
npx prisma migrate deploy
npm run seed                # idempotent

npm run dev                 # tsx watch, http://localhost:3001
# or: npm run build && npm start
curl http://localhost:3001/api/health
```

`backend/.env` defaults to `FACE_PROVIDER=mock` and
`DATABASE_URL=mysql://checkin:checkinpass@127.0.0.1:3307/checkin`.

### Seed credentials (development only)

| Actor | Credentials |
|---|---|
| Admin | `admin@school.edu` / `Admin@12345` |
| Demo students | `STU001` … `STU012` / `Student@12345` |
| Demo kiosk key | `demo-kiosk-key-12345` (`X-Device-Key`) |

`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEVICE_KEY`, `SEED_DEMO_STUDENTS` override
these. The seed is idempotent (upserts with `update: {}`, so real data is never overwritten)
and seeds realistic attendance for the last 7 school days + today so dashboard/reports/CSV
are populated. Demo students are created with a **backdated `createdAt` (90 days ago)** so
their historical absences still render, and demo students have **no face enrolled** (no real
face images are shipped); enroll them from the admin UI or `POST /api/students/:id/face` /
student self-service.

### npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | tsx watch server |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/server.js` |
| `npm run typecheck` | strict TS check for `src` + `tests` + seed |
| `npm test` | vitest integration suite (needs MySQL + `checkin_test`) |
| `npm run prisma:generate` | generate Prisma client |
| `npm run prisma:migrate` | `prisma migrate dev` (authoring) |
| `npm run prisma:deploy` | `prisma migrate deploy` (deployment) |
| `npm run seed` | run `prisma/seed.ts` via tsx |

---

## Docker (production face provider)

From the **repo root**:

```bash
docker compose build backend
docker compose up -d mysql backend
docker compose logs -f backend
curl http://localhost:3001/api/health
```

The image (`backend/Dockerfile`, `node:26.13.0-bookworm-slim`) installs dependencies with normal
`npm ci` so the **prebuilt `@tensorflow/tfjs-node` addon is available**, builds TypeScript,
and runs `docker-entrypoint.sh`, which:

1. waits for MySQL,
2. runs `prisma migrate deploy`,
3. runs the idempotent seed,
4. `exec node dist/server.js`.

Compose supplies `FACE_PROVIDER=human`, `FACE_MODEL_PATH=/app/models`,
`DATABASE_URL=mysql://…@mysql:3306/checkin`, and the `uploads` volume for `/app/storage`.
The container healthcheck hits `GET /api/health`; models load in the background after the
server starts (kiosk endpoints return `503 FACE_SERVICE_UNAVAILABLE` until ready).

Vendored models in `backend/models/`: `blazeface`, `facemesh`, `faceres` (~9 MB). Do not delete.

**Node 26 compatibility:** TensorFlow.js Node 4.22 (still the latest release) calls the legacy
`util.isNullOrUndefined()` helper that Node 23+ removed. `src/lib/node-compat.ts` installs a
one-line shim before TFJS is loaded; it is imported by `src/server.ts` and
`src/face/human.ts`. This build was verified end-to-end on Node 26.13.0 inside Docker (face
provider ready, 22/22 API E2E checks).

---

## Face recognition

**Phone/EXIF orientation:** Android and phone cameras often store portrait photos as landscape
pixels plus an EXIF orientation tag (`6`/`8`). `tfjs-node.decodeImage` ignores EXIF, which produced
sideways face descriptors and caused every live scan to be `NO_MATCH` even though enrollment looked
fine. `face/human.ts` now runs `sharp().metadata()` + `sharp().rotate()` (no-op for already-upright
files) before decoding, so enrollment and live scans are compared in a consistent upright frame.
Regression tests cover orientation 8 and already-upright images.

> If you are upgrading a database that already has face descriptors from before this fix, re-enroll
> those students once from the admin UI/API (or re-run enrollment with their stored photo). The
> descriptors themselves are not auto-rewritten. In this deployment `STU001` and `STU6767` were
> re-enrolled after the fix and verified at confidence 0.98–1.0.


`FACE_PROVIDER=human` (Docker) — lazy-imports Human + tfjs-node, loads models from
`FACE_MODEL_PATH`, decodes the uploaded frame with `tf.node.decodeImage`, runs
blazeface → facemesh → faceres, and returns the 1024-D `face.embedding` from the largest
face. More than one usable face is rejected (`MULTIPLE_FACES` in kiosk responses; `422` on
enrollment).

`FACE_PROVIDER=mock` (tests/local) — derives a deterministic unit-length 1024-D vector from
the SHA-256 of the image bytes: same image ⇒ cosine `1.0`, different image ⇒ cosine ≈ `0`
(overwhelmingly below the threshold). Test-only failure markers inside otherwise valid PNG
bytes: `__MOCK_NO_FACE__`, `__MOCK_MULTIPLE_FACES__`.

Matching:
- Normalized descriptors are cached in memory (active students, 30 s TTL, invalidated on
  enroll/update/deactivate) so a scan is O(students × 1024) — fine for ~1000+ students.
- `cosine(best, descriptor) ≥ settings.faceMatchThreshold` ⇒ match.
- Duplicate-face guard on enrollment: if the new descriptor matches **another** student at or
  above the threshold ⇒ `409 FACE_ALREADY_ENROLLED`.
- Descriptors are stored as JSON plus a SHA-256 hash; they are **never** returned by the API
  or written to logs.

### Threshold calibration

Default `0.60` (env `FACE_MATCH_THRESHOLD`, persisted in `settings.faceMatchThreshold`).
On the small reference probe set used for this project (Human 3.3.6 + FaceRes, frontal
frames):

- same-person cosine range ≈ **0.55 – 0.79**
- impostor cosine range ≈ **0.26 – 0.58**
- at `0.60`: 0 false accepts / 107 impostor pairs, 7 false rejects / 29 same-person pairs
- `0.55` admits 4 false accepts; `0.65+` rejects ~half of same-person pairs

So `0.60` is intentionally conservative (avoids false attendance marks at the cost of some
re-enrollment/recall misses). Tune on the school's own cameras via `PUT /api/settings`
(`faceMatchThreshold`) — it applies to the next scan without a restart. Add multi-sample
enrollment for better recall in future versions.

### Attendance rules (docs/API.md §5)

- One row per student per school-local date.
- No row today → check-in; status `PRESENT` unless `now > dayStartTime + lateGraceMinutes`
  (school timezone), then `LATE` with `lateMinutes`.
- Row with no checkout: scan within 60 s of the check-in → `ALREADY_CHECKED_IN` (no write);
  later scan → checkout (`CHECK_OUT`). After checkout → `ALREADY_CHECKED_OUT`.
- `mode=OUT` with no row yet → still creates a check-in with the documented message.
- Every scan (matched, no face, multiple faces, no match, provider error) writes a
  `scan_events` audit row. `SAVE_SCAN_IMAGES=false` by default (no frames stored).

**`lateMinutes` definition:** minutes past `dayStartTime + lateGraceMinutes` (minimum 1 when
late). Example: start `08:00`, grace `5`, arrival `08:10` ⇒ `lateMinutes = 5`, status `LATE`.

---

## Security notes

- JWT HS256, 12 h expiry; `sub` + `actorType`; role checks per route.
- bcrypt cost 12; admin/student passwords validated with zod (min 8).
- Kiosk device keys look like `kiosk_<base64url 32 bytes>`; only SHA-256 hash + 16-char
  prefix are stored. Rotation invalidates the old key immediately.
- Rate limits: auth 10/min/IP, kiosk scan 60/min/device, rest 300/min/IP (disabled in tests).
- helmet, CORS restricted to `CORS_ORIGINS`, JSON body limit 1 MB, multipart 8 MB, image
  magic-byte validation (client MIME type is not trusted).
- Photos are served only through `GET /api/students/:id/photo` with an admin JWT or that
  student's own JWT (`Cache-Control: private, max-age=300`).
- No face descriptors, passwords or tokens in responses/logs. Request logging records method,
  path, status and duration only.
- Production: set a long random `JWT_SECRET`, enable MySQL/disk encryption for biometric data,
  define consent/retention policy, and front the API with TLS.

---

## Tests

Integration tests run against a dedicated MySQL database (`checkin_test`), with migrations
applied by `tests/global-setup.ts`:

```bash
# one-time: create the test database (the compose checkin user can't create DBs)
docker exec checkin-mysql mysql -uroot -prootpass \
  -e "CREATE DATABASE IF NOT EXISTS checkin_test; GRANT ALL PRIVILEGES ON checkin_test.* TO 'checkin'@'%';"

cd backend
npm test
```

Override with `TEST_DATABASE_URL`. The suite covers auth/roles, registration + duplicate-face
guard, the kiosk 60 s state machine, absent synthesis, manual corrections (PATCH/PUT), devices
+ key rotation, settings, CSV export, reports/dashboard aggregation and descriptor secrecy.

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `3001` | |
| `DATABASE_URL` | — | required, MySQL URL |
| `TEST_DATABASE_URL` | `…/checkin_test` | tests only |
| `JWT_SECRET` | — | required, ≥ 32 chars |
| `JWT_EXPIRES_IN` | `12h` | |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | comma list, `*` allowed |
| `PUBLIC_BASE_URL` | `http://localhost:3001` | |
| `FACE_PROVIDER` | `mock` (`.env`) / `human` (compose) | |
| `FACE_MODEL_PATH` | `./models` | must contain blazeface/facemesh/faceres |
| `FACE_MATCH_THRESHOLD` | `0.60` | default used when settings row is created |
| `FACE_MIN_CONFIDENCE` | `0.5` | minimum detector box score for a usable face |
| `FACE_MAX_IMAGE_BYTES` | `8388608` | |
| `STORAGE_DIR` | `./storage` | faces/ + scans/ (Docker: `/app/storage` volume) |
| `SAVE_SCAN_IMAGES` | `false` | store kiosk frames for audits |
| `MAX_UPLOAD_MB` | `8` | |
| `RATE_LIMIT_DISABLED` | `false` | tests set `true` |
| `LOG_LEVEL` | `info` | `debug` logs each request line |
| `SEED_*` | see `.env.example` | seed overrides |

---

## Contract notes / documented decisions

No endpoint or payload deviates from `docs/API.md` in a breaking way. Clarified behaviours:

1. **`photoUrl` is `null` when the student has no stored photo** (per Lead request). Clients
   must null-check before rendering an avatar; the photo endpoint still returns `404` for
   missing files. Kiosk match responses likewise return `null` if a matched student somehow
   has no photo.
2. **Health is wrapped in the success envelope** (`GET /api/health`, `GET /api/kiosk/health`):
   `{success:true,data:{status,db,faceService,uptimeSeconds}}`. `/api/health` returns `503`
   with `status:"error"` when the DB is unreachable.
3. **Absences** are synthesized only on configured `settings.schoolDays` **and never before a
   student's enrollment date** (`Student.createdAt` converted to the school timezone). A
   student registered today is therefore not marked absent for earlier days; reports and the
   dashboard only count school days from each student's enrollment date onwards. On
   non-school dates the attendance list returns stored rows only. `GET /api/attendance`
   summary `checkInRate` uses `(present + late) / merged student-days`; `totalStudents` is the
   active filtered count.
4. **Synthesized absent rows** have id `absent:<studentId>:<YYYY-MM-DD>`. `PATCH
   /api/attendance/:id` accepts numeric ids **and** synthetic ids (the latter become upserts);
   `PUT /api/attendance/:studentId/:date` is the id-free correction/upsert endpoint.
5. **Rate limiting** returns HTTP `429` with code `RATE_LIMITED` (not in the contract's error
   table, but follows the error envelope).
6. **Kiosk unmatched scans** return HTTP `200` with `matched:false,reason:NO_FACE|
   MULTIPLE_FACES|NO_MATCH`; unreadable/corrupt bytes return `422 FACE_NOT_DETECTED`;
   an uninitialised provider returns `503 FACE_SERVICE_UNAVAILABLE`.
7. `GET /api/devices` returns `{items:[...]}`; attendance lists return the pagination object
   plus `summary`; student lists return the pagination object (as clarified by the Lead).
8. Seed restores the demo kiosk key via its hash. If the demo key was rotated in the UI,
   restarting the backend creates a *new* demo device row with the seed key (idempotency is
   keyed on the key hash).

---

## Layout

```
backend/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/20261105000000_init/migration.sql
│  └─ seed.ts
├─ src/
│  ├─ app.ts, server.ts
│  ├─ config/env.ts
│  ├─ lib/          # clock, time/date helpers, dto, errors, http, images, logger, security
│  ├─ middleware/   # auth (JWT + device key), error, rateLimit, upload, requestLogger
│  ├─ face/         # provider abstraction: human.ts, mock.ts, cosine, descriptor matcher
│  ├─ routes/       # auth, student, students, devices, kiosk, attendance, reports, dashboard, settings, health
│  └─ services/     # students, attendance (state machine + corrections), reports, settings, storage, audit
├─ models/          # vendored blazeface/facemesh/faceres
├─ tests/           # vitest + supertest integration suite
├─ Dockerfile, docker-entrypoint.sh, .dockerignore
└─ README.md
```
