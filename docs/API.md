# Student Check-In System — API Contract v1

All API routes are under **`/api`**. The default local base URL is `http://localhost:3001/api`.
Consumers: Next.js admin/student web app (browser) and the Android kiosk app.

The Next.js web service also exposes a same-origin proxy at `http://<school-host>:3000/api/*`
(implemented in `admin/src/app/api/[...path]/route.ts`; Docker target `http://backend:3001`). The
Android kiosk defaults to this URL so only port 3000 needs to be reachable on the school network;
the API contract is unchanged through either base URL.

## Conventions

- Transport: JSON over HTTP (except multipart uploads, photo responses and CSV export).
- Success envelope: `{ "success": true, "data": <payload> }`
- Error envelope: `{ "success": false, "error": { "code": "STRING_CODE", "message": "Human readable", "details": <optional> } }`
- Date: `YYYY-MM-DD` (school timezone from settings, default `Asia/Hong_Kong`).
- Timestamp: ISO-8601 with offset, e.g. `2025-03-03T08:04:11+08:00`.
- Pagination payload: `{ "items": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }`
- Auth (admin / student): `Authorization: Bearer <JWT>`
- Auth (kiosk device): `X-Device-Key: <device api key>`
- Max upload size: 8 MB. Accepted images: `image/jpeg`, `image/png`, `image/webp`.
- Rate limits: auth 10/min/IP, kiosk scan 60/min/device, rest 300/min/IP.

### Error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body/query/params; `details` holds field errors |
| 401 | `UNAUTHORIZED` | Missing/invalid JWT or device key |
| 403 | `FORBIDDEN` | Valid token, insufficient role |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate student id, duplicate face, already enrolled, etc. |
| 413 | `FILE_TOO_LARGE` | Image > 8 MB |
| 422 | `FACE_NOT_DETECTED` | No single usable face in uploaded image |
| 500 | `INTERNAL_ERROR` | Unexpected failure |
| 503 | `FACE_SERVICE_UNAVAILABLE` | Models not loaded yet / provider failure |

---

## 1. Auth

### `POST /api/auth/admin/login`
Body JSON: `{ "email": "admin@school.edu", "password": "Admin@12345" }`

Response `200`:
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": "1", "email": "admin@school.edu", "name": "School Administrator", "role": "SUPER_ADMIN" }
  }
}
```

### `POST /api/auth/student/register`
`multipart/form-data`.

| Field | Type | Rules |
|---|---|---|
| studentId | text | required, 3–20 chars, `[A-Za-z0-9_-]`, unique, **primary key** |
| firstName | text | required, 1–60 chars |
| lastName | text | required, 1–60 chars |
| dob | text | required, `YYYY-MM-DD`, must be in the past |
| sex | text | `MALE`, `FEMALE` or `OTHER` |
| class | text | required, e.g. `7A` |
| form | text | required, e.g. `Form 2` |
| password | text | required, min 8 chars |
| faceImage | file | required, exactly one detectable face (used as profile photo + face key) |

Response `201`:
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "student": {
      "studentId": "STU1001",
      "firstName": "Mei",
      "lastName": "Chan",
      "fullName": "Mei Chan",
      "dob": "2011-04-19",
      "sex": "FEMALE",
      "class": "7A",
      "form": "Form 2",
      "photoUrl": "/api/students/STU1001/photo",
      "faceEnrolled": true
    }
  }
}
```
Errors: `409 CONFLICT` duplicate studentId; `409 FACE_ALREADY_ENROLLED` if the descriptor matches an existing student; `422 FACE_NOT_DETECTED`.

### `POST /api/auth/student/login`
Body `{ "studentId": "STU1001", "password": "..." }`
Response `200`: `{ token, student }` (same student shape as above).

### `GET /api/auth/me`
Bearer JWT (admin or student). Response `200`: `{ "actorType": "admin" | "student", "user": { ... } }`.

### `POST /api/auth/student/change-password`
Bearer student. Body `{ "currentPassword": "...", "newPassword": "..." }`.

---

## 2. Student self-service

### `GET /api/student/profile`
Bearer student. Student object.

### `POST /api/student/enroll-face`
Bearer student. `multipart/form-data`, field `faceImage`. Replaces the stored descriptor/photo.
Response `200`: `{ "faceEnrolled": true, "enrolledAt": "..." }`. Errors `409 FACE_ALREADY_ENROLLED`, `422 FACE_NOT_DETECTED`.

### `GET /api/student/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`
Bearer student. Defaults: current month. Response `200`:
```json
{
  "items": [
    {
      "id": "42",
      "date": "2025-03-03",
      "checkInAt": "2025-03-03T08:03:00+08:00",
      "checkOutAt": "2025-03-03T15:12:00+08:00",
      "status": "LATE",
      "lateMinutes": 3,
      "note": null
    }
  ],
  "summary": { "present": 12, "late": 2, "absent": 1, "checkedOut": 13 }
}
```

---

## 3. Students (admin)

All routes require an admin JWT.

### `GET /api/students`
Query: `search` (studentId/name), `class`, `form`, `status` (`ACTIVE`|`INACTIVE`|`ALL`, default ACTIVE), `faceEnrolled` (`true`|`false`), `page` (1), `pageSize` (20, max 100), `sort` (`studentId`|`name`|`createdAt`, default `studentId`).

Response `data`: pagination object with student rows:
```json
{
  "studentId": "STU1001", "firstName": "Mei", "lastName": "Chan", "fullName": "Mei Chan",
  "dob": "2011-04-19", "sex": "FEMALE", "class": "7A", "form": "Form 2",
  "faceEnrolled": true, "status": "ACTIVE", "photoUrl": "/api/students/STU1001/photo",
  "createdAt": "...", "todayStatus": "PRESENT"
}
```

### `POST /api/students`
Admin creates a student. `multipart/form-data` with same fields as self-registration except `password` is optional (default `Student@12345`; response includes `initialPassword`) and `faceImage` is optional. Response `201`: `{ student, initialPassword? }`.

### `GET /api/students/:studentId`
Response: `{ student, recentAttendance: [...] }`.

### `PATCH /api/students/:studentId`
JSON: any of `firstName,lastName,dob,sex,class,form,status`. Response updated student.

### `DELETE /api/students/:studentId`
Soft-deactivates (`status=INACTIVE`). Response `200` `{ "studentId": "...", "status": "INACTIVE" }`.

### `POST /api/students/:studentId/face`
Admin enrolls/re-enrolls a face. `multipart/form-data`, field `faceImage`. Same errors as self-enroll.

### `POST /api/students/:studentId/reset-password`
Admin resets password. Body optional `{ "newPassword": "..." }`. Response `{ "studentId": "...", "temporaryPassword": "..." }`.

### `GET /api/students/:studentId/photo`
Returns the stored JPEG/PNG. Admin JWT **or** that student's JWT. `Cache-Control: private, max-age=300`.

### `GET /api/students/meta/options`
Distinct classes and forms for filters: `{ "classes": ["7A","7B"], "forms": ["Form 2","Form 3"] }`.

---

## 4. Devices (admin)

### `GET /api/devices`
Response `200`: `data` is `{ "items": [ ... ] }` (standard envelope, not paginated). Each row:
`{ id, name, location, active, lastSeenAt, online, apiKeyPrefix, createdAt }` where `online = lastSeenAt within 2 minutes`.

### `POST /api/devices`
Body `{ "name": "Main Gate Tablet", "location": "Main Entrance" }`.
Response `201`: `{ "device": {...}, "apiKey": "kiosk_..." }` — **apiKey is returned only once**. Store only its SHA-256 hash.

### `PATCH /api/devices/:id`
Body any of `{ name, location, active }`.

### `POST /api/devices/:id/rotate-key`
Response `{ "device": {...}, "apiKey": "kiosk_..." }` (new key, old key invalid immediately).

### `DELETE /api/devices/:id`
Delete device. Response `204` (no body).

---

## 5. Kiosk / face scan

### `GET /api/kiosk/health`
Header `X-Device-Key`. Standard envelope; `data` = `{ device: { id, name, location }, serverTime, faceServiceReady }`.

### `POST /api/kiosk/verify`
Header `X-Device-Key`. `multipart/form-data`:
- `image` — required JPEG/PNG frame
- `mode` — optional `AUTO` (default), `IN`, `OUT`. `AUTO` toggles check-in/out.
- `liveness` — optional `"true"`; Android may send a short burst as repeated requests (not implemented in v1).

Flow:
1. Device authenticated and active; `lastSeenAt` updated.
2. Exactly one face detected in the frame — 1024-D descriptor (Human FaceRes) extracted.
3. Cosine similarity against all active enrolled students; best score must be ≥ settings threshold (default `0.60`).
4. Attendance for today is created/toggled (school timezone).

Always `200` for a completed scan, including unmatched faces:
```json
{
  "success": true,
  "data": {
    "matched": true,
    "action": "CHECK_IN",
    "confidence": 0.9361,
    "student": {
      "studentId": "STU1001", "fullName": "Mei Chan", "class": "7A", "form": "Form 2",
      "photoUrl": "/api/students/STU1001/photo"
    },
    "attendance": {
      "id": "42", "date": "2025-03-03",
      "checkInAt": "2025-03-03T08:03:00+08:00",
      "checkOutAt": null,
      "status": "LATE", "lateMinutes": 3
    },
    "message": "Checked in — 3 minutes late"
  }
}
```
`action` values: `CHECK_IN`, `CHECK_OUT`, `ALREADY_CHECKED_IN`, `ALREADY_CHECKED_OUT`.
Rules:
- No attendance row today — create check-in (`PRESENT` or `LATE`). If `mode=OUT`, still creates check-in with message "No check-in today; checked in instead."
- Row with no `checkOutAt` and last scan > 60 s ago — set checkout, `action=CHECK_OUT`.
- Row with no `checkOutAt` and scan within 60 s — `ALREADY_CHECKED_IN` (no DB change).
- Row with `checkOutAt` — `ALREADY_CHECKED_OUT` (no DB change; admins can correct manually).

Unmatched:
```json
{ "success": true, "data": { "matched": false, "reason": "NO_MATCH", "message": "Face not recognised" } }
```
`reason`: `NO_FACE`, `MULTIPLE_FACES`, `NO_MATCH`. `MULTIPLE_FACES` is returned when more than one usable face is detected (v1 requires a single face).
Errors: `401 UNAUTHORIZED` bad/inactive device key; `422 FACE_NOT_DETECTED` for an unreadable image; `503 FACE_SERVICE_UNAVAILABLE`.

### `POST /api/kiosk/heartbeat`
Header `X-Device-Key`, empty body — `{ "ok": true, "serverTime": "..." }`; updates `lastSeenAt`.

---

## 6. Attendance & reports (admin)

### `GET /api/attendance`
Query: `date` or `from`/`to`, `class`, `form`, `status` (`PRESENT|LATE|ABSENT`), `studentId`, `page`, `pageSize`.
Absent rows are synthesized for active students without a check-in on the requested day (one day at a time), only on configured school days and never before the student's enrollment date (`Student.createdAt` in the school timezone).
Response `data`: pagination of:
```json
{
  "id": "42", "studentId": "STU1001", "fullName": "Mei Chan", "class": "7A", "form": "Form 2",
  "date": "2025-03-03", "checkInAt": "...", "checkOutAt": "...", "status": "LATE",
  "lateMinutes": 3, "method": "FACE", "note": null, "checkedOut": true
}
```
plus `summary: { totalStudents, present, late, absent, checkedOut, checkInRate }`.

### `GET /api/attendance/today`
Shortcut for `GET /api/attendance?date=<today>`.

### `PATCH /api/attendance/:id`
Manual correction for an existing attendance row. Body `{ "status": "PRESENT|LATE|ABSENT", "checkInAt": "...", "checkOutAt": "...", "note": "..." }`.
An `ABSENT` correction deletes the row; otherwise the row is updated.

### `PUT /api/attendance/:studentId/:date`
Manual correction / upsert by student + school date (`YYYY-MM-DD`) — use this for **synthesized absent rows** that have no `id`. Body `{ "status": "PRESENT|LATE|ABSENT", "checkInAt": "...", "checkOutAt": "...", "note": "..." }`.
- `ABSENT` → delete any row for that student/date (absence is then derived again).
- `PRESENT` / `LATE` → upsert; `checkInAt` defaults to now, `lateMinutes` is recomputed from settings unless `status=PRESENT`.
Response `200`: the resulting attendance row, or `{ studentId, date, status: "ABSENT" }` when deleted. Returns `404 NOT_FOUND` if the student does not exist.

### `GET /api/attendance/export`
Query: `from`, `to`, `class`, `form`, `status`, `format` (`csv`, default). Returns `text/csv` with `Content-Disposition: attachment`.
Columns: `student_id,full_name,class,form,date,check_in,check_out,status,late_minutes,method,note`.

### `GET /api/reports/summary`
Query: `from` (required), `to` (required), `class`, `form`, optional `groupBy=day|student` (default `day`).
Response:
```json
{
  "from": "2025-03-01", "to": "2025-03-07",
  "totals": { "studentDays": 70, "present": 60, "late": 7, "absent": 3, "attendanceRate": 95.71 },
  "days": [ { "date": "2025-03-01", "present": 10, "late": 1, "absent": 1, "total": 12 } ],
  "students": [ { "studentId": "STU1001", "fullName": "Mei Chan", "class": "7A", "form": "Form 2", "present": 4, "late": 1, "absent": 0 } ]
}
```

### `GET /api/dashboard`
Query `date` (default today). Response:
```json
{
  "date": "2025-03-03",
  "stats": { "totalStudents": 240, "present": 210, "late": 18, "absent": 12, "checkedOut": 120, "checkInRate": 95.0 },
  "recentScans": [ { "studentId": "STU1001", "fullName": "Mei Chan", "action": "CHECK_IN", "status": "LATE", "at": "...", "device": "Main Gate Tablet" } ],
  "lateTrend": [ { "date": "2025-02-25", "late": 12, "present": 205, "absent": 23 } ]
}
```

### `GET /api/settings` (admin) / `PUT /api/settings` (admin)
JSON:
```json
{
  "schoolName": "Greenfield Secondary School",
  "dayStartTime": "08:00",
  "lateGraceMinutes": 5,
  "timezone": "Asia/Hong_Kong",
  "faceMatchThreshold": 0.60,
  "schoolDays": [1,2,3,4,5]
}
```
`schoolDays` uses ISO weekdays (1=Mon … 7=Sun); used by reports to exclude non-school days from absence calculations.

### `GET /api/health`
Public. Standard envelope; `data` is `{ "status": "ok", "db": "ok", "faceService": "ready", "uptimeSeconds": 123 }`.

---

## 7. Enumerations (shared)

- `Sex`: `MALE`, `FEMALE`, `OTHER`
- `StudentStatus`: `ACTIVE`, `INACTIVE`
- `AttendanceStatus`: `PRESENT`, `LATE`, `ABSENT`
- `AttendanceMethod`: `FACE`, `MANUAL`
- `ScanAction`: `CHECK_IN`, `CHECK_OUT`, `ALREADY_CHECKED_IN`, `ALREADY_CHECKED_OUT`
- `AdminRole`: `SUPER_ADMIN`, `ADMIN`

## 8. Seed credentials (development only)

- Admin: `admin@school.edu` / `Admin@12345` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
- Demo kiosk device key: `demo-kiosk-key-12345` (override with `SEED_DEVICE_KEY`); device name `Demo Kiosk`.
- Demo students `STU001–STU012`, password `Student@12345`.
