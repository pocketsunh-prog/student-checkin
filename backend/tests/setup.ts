/**
 * Per-worker test environment. Runs before the test file's module graph is
 * loaded, so src/config/env.ts picks up these values (dotenv never overrides
 * variables that already exist).
 */
import path from 'node:path';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'mysql://checkin:checkinpass@127.0.0.1:3307/checkin_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.FACE_PROVIDER = 'mock';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '12h';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.LOG_LEVEL = 'error';
process.env.SAVE_SCAN_IMAGES = 'false';
process.env.STORAGE_DIR = path.resolve(process.cwd(), 'tests', '.tmp', 'storage');
process.env.FACE_MATCH_THRESHOLD = '0.6';
process.env.FACE_MIN_CONFIDENCE = '0.5';
