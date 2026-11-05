# Architecture — Student Check-In / Check-Out System

## 1. Overview

```
Browser (admin/student) ──────┐  REST /api (JWT)
                              ▼
Android kiosk ──────────▶ Next.js web service (3000) ──▶ Node.js/Express API (3001) ──▶ MySQL 8
  http://host:3000/api     admin + student pages          Prisma · JWT/device keys      3307→3306
  X-Device-Key + JPEG      /api/* same-origin proxy        Human FaceRes + TensorFlow.js
```

- **Face recognition runs on the backend.** Enrollment and check-in both upload a JPEG; the server
  extracts a 1024-D FaceRes embedding (`@vladmandic/human` + TensorFlow.js Node) and stores it in
  MySQL as the student's "face key". Kiosks stay thin: camera → upload → show result.
- **Attendance is one row per student per school day** with `check_in_at` / `check_out_at`.
  A scan with no row creates a check-in; the next scan after 60 s creates a check-out.
- **Late rule** comes from settings: `dayStartTime` + `lateGraceMinutes`, evaluated in the school
  timezone (`Asia/Hong_Kong` by default).
- **Absence is derived**: active students without a check-in on a school day are absent in reports,
  but never for dates before the student's enrollment (`createdAt`) in the school timezone.
- **Multi-kiosk auth** uses per-device API keys (SHA-256 hash at rest), not user passwords.
- **Two identity types**: admin JWT (`admins`) and student JWT (`students`). Student JWT is used for
  the self-service portal and face re-enrollment; admin JWT for everything else.

## 2. Components

| Component | Tech | Location | Port |
|---|---|---|---|
| Admin/student web | Next.js 16 (App Router), React 19, TypeScript, Tailwind | `admin/` | 3000 |
| API + recognition | Node.js 26 LTS, Express, TypeScript, Prisma, Zod, JWT, Multer | `backend/` | 3001 |
| Database | MySQL 8.0 in Docker, volume `mysql_data` | `docker-compose.yml` | 3307 (host) |
| Kiosk app | Android native Kotlin, Jetpack Compose, CameraX, OkHttp | `android/` | — |
| Face models | blazeface, facemesh, faceres (~9 MB) | `backend/models/` | — |

## 3. Face pipeline

1. Image upload is memory-buffered by Multer (max 8 MB), validated by MIME + magic bytes.
2. `faceService.extract(buffer)`:
   - `tf.node.decodeImage` → RGB tensor → `human.detect()`.
   - Detect faces (`blazeface`), mesh (`facemesh`), embedding (`faceres`).
   - Use the largest face; reject >1 useable face (`MULTIPLE_FACES`) or none (`NO_FACE`).
   - Return `{ descriptor: number[1024], confidence: face.boxScore, box }`.
3. Enrollment: reject if the descriptor's cosine similarity to any existing active student is
   ≥ threshold (duplicate face guard), then persist JSON + SHA-256 + photo.
4. Check-in: compare against all active students with descriptors, pick the best cosine similarity.
   Match if `best >= faceMatchThreshold` (default 0.60); otherwise `NO_MATCH`.
5. Threshold is configurable through settings/env. It must be tuned on the school's own cameras;
   0.60 is a conservative demo default that avoids false accepts on the reference probe set while
   accepting most same-person pairs. Multiple enrollment samples would improve recall.
6. Face descriptors are treated as sensitive biometric data: never returned by the API, never
   logged, excluded from CSV, and protected by the DB/volume at rest.

## 4. Attendance state machine

```
scan ──▶ no row today? ──yes──▶ create row: status = LATE if now > start+grace else PRESENT
                │                 action = CHECK_IN
                no
                ▼
        check_out_at null? ──yes──▶ scan within 60s? ──yes──▶ ALREADY_CHECKED_IN (no write)
                │                          no
                │                          ▼
                │                   set check_out_at; action = CHECK_OUT
                no
                ▼
        ALREADY_CHECKED_OUT (no write)
```

- Time comparisons use UTC `Date` objects plus `Intl.DateTimeFormat` in the school timezone for
  date/time-of-day calculations, so DST/zone changes are handled correctly.
- Every scan writes a `scan_events` audit row (including unmatched attempts, without storing the
  image unless `SAVE_SCAN_IMAGES=true`).

## 5. API & security

- JWT HS256, 12 h expiry, `sub` = id, `actorType` = `admin` | `student`.
- bcrypt (cost 12) password hashes; zod validation on every input; parameterized Prisma queries.
- CORS restricted to `CORS_ORIGINS`; helmet; rate limits per IP/device.
- Device keys look like `kiosk_<32 bytes base64url>`; only hash + prefix stored. Rotation invalidates
  the old key immediately.
- Uploads are served through an authenticated route, not a public static directory.
- Production checklist is in `README.md`.

## 6. Directory layout

```
.
├─ docker-compose.yml
├─ .env.example
├─ docs/{API.md,DATABASE.md,ARCHITECTURE.md}
├─ backend/
│  ├─ prisma/{schema.prisma,migrations,seed.ts}
│  ├─ src/{server.ts,app.ts,config,lib,middleware,routes,services,face}
│  ├─ models/                  # vendored blazeface/facemesh/faceres
│  ├─ tests/
│  └─ Dockerfile
├─ admin/                      # Next.js
└─ android/                    # Gradle Android project
```

## 7. Why these choices

- **Server-side recognition** keeps all kiosks consistent and prevents descriptor theft on devices;
  phones only need camera + network. A school has many devices, so deployment is simpler than
  shipping an on-device model and doing match sync.
- **MySQL** because it is explicitly requested; Prisma gives typed models, migrations and safe
  queries.
- **Node.js + Next.js** share TypeScript types and one ecosystem, while the Android app is native
  Kotlin because it needs reliable camera control on fixed school phones/tablets.
- **Device keys instead of kiosk logins** — devices are long-lived; teacher logins are not suitable
  for hands-free attendance.

## 8. Known limits / next steps

- One face sample per student; add multi-sample enrollment (3 angles) for higher recall.
- No anti-spoofing in v1 (a printed photo could pass). For production add a blink/turn challenge or
  Human's `antispoof`/`liveness` models and a second frame.
- Single-server face matching is fine for a few thousand students; for multi-site scale, precompute
  normalized descriptors and use a vector index / Redis cache.
- No push notifications to parents; reports are CSV/on-screen.
