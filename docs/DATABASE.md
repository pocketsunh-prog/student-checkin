# Database Model (MySQL 8, Prisma)

Database name: `checkin` (configurable via `MYSQL_DATABASE`). Charset `utf8mb4`, collation `utf8mb4_unicode_ci`, engine InnoDB, timezone UTC internally (`DATETIME(3)`); the API presents times in the school timezone.

## `admins`

| column | type | notes |
|---|---|---|
| id | BIGINT UNSIGNED PK AI | |
| email | VARCHAR(190) UNIQUE | lower-cased |
| name | VARCHAR(120) | |
| password_hash | VARCHAR(255) | bcrypt, cost 12 |
| role | ENUM('SUPER_ADMIN','ADMIN') | default ADMIN |
| created_at / updated_at | DATETIME(3) | |

## `students`

Student **student_id is the primary key**.

| column | type | notes |
|---|---|---|
| student_id | VARCHAR(32) PK | user-visible key, immutable after creation |
| first_name | VARCHAR(60) | |
| last_name | VARCHAR(60) | |
| dob | DATE | |
| sex | ENUM('MALE','FEMALE','OTHER') | |
| class | VARCHAR(32) | e.g. `7A` |
| form | VARCHAR(32) | e.g. `Form 2` |
| password_hash | VARCHAR(255) | bcrypt |
| face_descriptor | JSON NULL | 1024 float array from Human FaceRes; the "face recognition key" |
| face_descriptor_hash | CHAR(64) NULL | sha256 of canonical descriptor; helps duplicate audits |
| face_enrolled_at | DATETIME(3) NULL | |
| photo_path | VARCHAR(255) NULL | relative path under storage `faces/` |
| status | ENUM('ACTIVE','INACTIVE') | default ACTIVE |
| created_at / updated_at | DATETIME(3) | |

Indexes: `(class, form)`, `(status)`, `(face_enrolled_at)`.
The descriptor is never returned by any API; only booleans/URLs are exposed.

## `devices`

Many school phones/tablets.

| column | type | notes |
|---|---|---|
| id | CHAR(36) PK | UUID |
| name | VARCHAR(120) | |
| location | VARCHAR(190) | |
| api_key_hash | CHAR(64) UNIQUE | SHA-256 hex of the key |
| api_key_prefix | VARCHAR(16) | display only |
| active | BOOLEAN | default true |
| last_seen_at | DATETIME(3) NULL | updated on verify/heartbeat |
| created_at / updated_at | DATETIME(3) | |

## `attendance`

One row per student per school day.

| column | type | notes |
|---|---|---|
| id | BIGINT UNSIGNED PK AI | |
| student_id | VARCHAR(32) FK →students | `ON DELETE RESTRICT` |
| date | DATE | school-local date |
| check_in_at | DATETIME(3) NULL | |
| check_out_at | DATETIME(3) NULL | |
| status | ENUM('PRESENT','LATE','ABSENT') | default PRESENT |
| late_minutes | INT UNSIGNED | default 0 |
| method | ENUM('FACE','MANUAL') | default FACE |
| check_in_device_id | CHAR(36) NULL FK →devices | `ON DELETE SET NULL` |
| check_out_device_id | CHAR(36) NULL FK →devices | `ON DELETE SET NULL` |
| note | VARCHAR(500) NULL | |
| created_at / updated_at | DATETIME(3) | |

Unique: `(student_id, date)`. Indexes: `(date, status)`, `(student_id, date DESC)`.
An `ABSENT` row is normally not stored: absentees are synthesized from active students with no check-in for a school day, only from each student's enrollment date (`students.created_at` in the school timezone) onward. A manual correction may store ABSENT rows if desired (API contract allows either; implementation should return consistent results).

## `scan_events`

Audit log for kiosk attempts.

| column | type | notes |
|---|---|---|
| id | BIGINT UNSIGNED PK AI | |
| device_id | CHAR(36) NULL FK →devices | `ON DELETE SET NULL` |
| student_id | VARCHAR(32) NULL FK →students | `ON DELETE SET NULL`; null when unmatched |
| action | ENUM('CHECK_IN','CHECK_OUT','UNRECOGNIZED') | |
| result | ENUM('SUCCESS','NO_FACE','MULTIPLE_FACES','NO_MATCH','ERROR') | |
| confidence | DOUBLE NULL | 0..1 cosine similarity |
| image_path | VARCHAR(255) NULL | only when `SAVE_SCAN_IMAGES=true` |
| created_at | DATETIME(3) | |

Indexes: `(created_at)`, `(device_id)`, `(student_id)`.

## `settings`

Single row (`id = 1`).

| column | type | default |
|---|---|---|
| id | TINYINT PK | 1 |
| school_name | VARCHAR(190) | `Greenfield Secondary School` |
| day_start_time | CHAR(5) | `08:00` |
| late_grace_minutes | SMALLINT UNSIGNED | 5 |
| timezone | VARCHAR(64) | `Asia/Hong_Kong` |
| face_match_threshold | DOUBLE | 0.60 |
| school_days | JSON | `[1,2,3,4,5]` |
| updated_at | DATETIME(3) | |

## Notes

- `student_id` is a natural primary key. Changing it is not supported in v1 (delete/recreate).
- All API timestamps are ISO strings with timezone; internal Prisma values are UTC Dates.
- Face descriptors are JSON float arrays (~8 KB each). Do not log them. They are personal biometric data: production deployments must encrypt at rest (MySQL TDE / disk encryption) and define retention/consent policies.
- Migration is managed with Prisma Migrate (`prisma migrate deploy` at container start).
