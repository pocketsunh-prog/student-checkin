# SchoolCheck — admin & student web app

Next.js 15 (App Router) web app for the student check-in / check-out system. It contains:

- the **admin console** (dashboard, students, face enrolment, attendance, reports, kiosk devices, settings), and
- the **public student pages** (self-registration with a webcam photo and the student attendance portal).

The backend API is a separate Node.js service in `../backend` (see `../docs/API.md`). This app only
talks to it over HTTP; it does not need the API to be running in order to build.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router, standalone output) |
| UI | React 19, TypeScript (strict), Tailwind CSS v3.4 |
| Data | Typed `fetch` wrapper against `docs/API.md` (no external state library) |
| Auth | Bearer JWT in `localStorage`, client-side route guard |
| Charts | Hand-rolled SVG/CSS (no chart dependency) |
| Runtime | Node 20+ (local dev tested on Node 24) |

## Screens

| Route | Purpose |
|---|---|
| `/login` | Admin sign-in (demo credentials shown on the page) |
| `/` | Dashboard: today's stats, recent kiosk scans, 14-day attendance trend, quick links (auto-refresh every 60 s) |
| `/students` | Searchable / filterable / paginated student table, add-student modal (optional face capture) |
| `/students/[studentId]` | Profile, edit details, reset password, enroll / re-enroll face via webcam, recent attendance, deactivate/reactivate |
| `/attendance` | Single-day register: date picker, class/form/status/student filters, summary chips, manual correction, CSV export |
| `/reports` | Date-range report: totals, per-day and per-student breakdowns, late/absentee views, CSV export |
| `/devices` | Kiosk devices: online status, create device (one-time API key modal with copy), rotate key, enable/disable, delete |
| `/settings` | School name, start time, late grace, timezone, face match threshold, school days |
| `/register` | Public student self-registration (details → face photo → success screen) |
| `/student` | Student sign-in and own attendance portal (history, face re-enrolment, password change) |

Shared UI: responsive sidebar/top bar, cards, badges, tables, modals, toasts, skeleton/empty/error
states, date pickers and accessible forms. The webcam component is reused by self-registration, the
admin add-student modal and both face-enrolment flows.

## Local setup

Requirements: Node.js 20+ (Node 24 works), npm 10+.

```bash
cd admin
npm install
cp .env.example .env.local   # optional; the default API URL is already correct
npm run dev                  # http://localhost:3000
```

Start the API first (`docker compose up -d mysql backend` from the repo root) if you want live data.
The UI still renders when the API is down — pages show an error state with a retry button.

### Demo credentials

| Role | Credentials |
|---|---|
| Admin | `admin@school.edu` / `Admin@12345` |
| Students | `STU001` … `STU012` / `Student@12345` |
| Kiosk device key | `demo-kiosk-key-12345` (device "Demo Kiosk") |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Base URL of the backend API. **Inlined at build time** — rebuild after changing it. |
| `PORT` | `3000` | Used by `next dev` / `next start` (the standalone server uses `PORT`, default 3000). |

## Webcam and localhost

Browsers only expose `getUserMedia` in a **secure context**: `https://` or `http://localhost`
(and `127.0.0.1`). If the app is opened over plain HTTP on a LAN IP (e.g. `http://192.168.1.20:3000`),
the camera will be blocked with a permission/security error.

Options for a real classroom deployment:

1. Serve the app behind HTTPS (reverse proxy / TLS) — recommended.
2. Use the “Upload photo instead” fallback that is built into every camera component.
3. For development only, Chrome’s `chrome://flags/#unsafely-treat-insecure-origin-as-secure` can
   whitelist an origin.

The component handles `NotAllowedError` (permission denied), `NotFoundError` (no camera),
`NotReadableError` (camera busy) and non-secure contexts with human-readable messages, and releases
the camera when the component unmounts or the photo is captured.

## Auth & token storage (XSS trade-off)

The API is a cross-origin/stateless JWT API, so tokens are stored in `localStorage` (admin and
student sessions are separate keys). This keeps the app simple and survives reloads, and the token is
hydrated only after mount to avoid SSR/hydration mismatches.

**Trade-off:** unlike an `httpOnly` cookie, `localStorage` is readable by JavaScript, so an XSS bug
could exfiltrate the token. Mitigations in this app: React escapes rendered values, no
`dangerouslySetInnerHTML` with user data, and JWTs expire after 12 h. For a hardened production
deployment, add a strict Content-Security-Policy at the reverse proxy, or move to a Next.js
route-handler BFF that keeps the token in an `httpOnly`, `SameSite=Lax` cookie and proxies API calls
server-side.

All API calls go through `src/lib/api.ts`, which parses the contract envelopes
(`{success:true,data}` / `{success:false,error}`), attaches the bearer token, and on `401` clears the
stored session and redirects to `/login` (admin) or `/student` (student).

## API integration notes

- Endpoints are exactly those in `../docs/API.md`; nothing is invented here.
- `GET /devices` returns `data: { items: [...] }`; other list endpoints use the pagination object.
- Student photos (`photoUrl`) and CSV exports require the bearer token, so they are fetched with
  `fetch` and rendered/saved from a blob (plain `<a href>` / `<img src>` cannot send the header).
- Attendance corrections use the upsert endpoint
  `PUT /attendance/:studentId/:date` (works for recorded rows and synthesized absent rows).
- File uploads use the contract field names: `faceImage` for student registration and face
  enrolment (admin and student), and multipart form-data for create-student.

## Production build

```bash
npm run build     # compiles; output: .next/standalone (next.config.ts sets output: 'standalone')
npm start         # serves the standalone build on port 3000 (node .next/standalone/server.js)
npm run typecheck # tsc --noEmit
```

`next.config.ts` uses `output: 'standalone'`, so `next start` is not used: the `postbuild` script
(`scripts/prepare-standalone.mjs`) copies `public/` and `.next/static/` into `.next/standalone/`, and
`npm start` runs `node .next/standalone/server.js`. Set `PORT` to change the port. The build never
contacts the API.

## Docker

From the repository root (uses `docker-compose.yml`):

```bash
docker compose build admin
docker compose up -d admin     # http://localhost:3000
```

Standalone image build with a custom API URL:

```bash
cd admin
docker build -t checkin-admin \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001/api .
docker run --rm -p 3000:3000 checkin-admin
```

The image is multi-stage (`deps` → `builder` → `runner`), runs the Next standalone server as the
non-root `nextjs` user, exposes port 3000, and does not require the API at build time.

## Project structure

```
admin/
├─ Dockerfile                 # multi-stage standalone build
├─ next.config.ts             # output: 'standalone'
├─ tailwind.config.ts         # navy/emerald design tokens
├─ src/
│  ├─ app/
│  │  ├─ (admin)/             # authenticated console (sidebar layout)
│  │  ├─ login/               # admin sign-in
│  │  ├─ register/            # public student self-registration
│  │  └─ student/             # student portal
│  ├─ components/
│  │  ├─ ui/                  # design system: button, card, input, badge, table, modal, toast, charts…
│  │  ├─ layout/              # app shell, sidebar, auth guard
│  │  ├─ students/            # add-student modal, face-enrol panel
│  │  ├─ attendance/          # correction modal
│  │  └─ webcam-capture.tsx   # getUserMedia → JPEG blob component
│  └─ lib/                    # api client, auth storage, types, utils, toast, session hooks
└─ public/favicon.svg
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build (standalone) |
| `npm start` | Serve the production build on port 3000 |
| `npm run typecheck` | `tsc --noEmit` |

## Known limitations

- Face enrolment stores one photo per student (the API supports one descriptor in v1). Re-enrolling
  replaces it; there is no multi-sample capture UI.
- No admin password-change endpoint exists in the API contract; admin accounts are managed by the
  backend seed/env vars.
- Browser-side date inputs use the browser's locale; timestamps returned by the API are displayed in
  the browser's timezone. The backend applies the school timezone from settings to the register.
- Offline behaviour is limited to error states with retry; there is no service worker / offline cache.
