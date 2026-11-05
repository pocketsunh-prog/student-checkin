import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load backend/.env when present. Existing environment variables always win
// (Docker compose / CI provide their own values).
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const boolString = (defaultValue: boolean) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('12h'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3001'),

  FACE_PROVIDER: z.enum(['human', 'mock']).default('mock'),
  FACE_MODEL_PATH: z.string().default('./models'),
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  FACE_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.5),
  FACE_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),

  STORAGE_DIR: z.string().default('./storage'),
  SAVE_SCAN_IMAGES: boolString(false),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(8),
  RATE_LIMIT_DISABLED: boolString(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  SEED_ADMIN_EMAIL: z.string().default('admin@school.edu'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_ADMIN_NAME: z.string().default('School Administrator'),
  SEED_DEVICE_NAME: z.string().default('Demo Kiosk'),
  SEED_DEVICE_LOCATION: z.string().default('Main Entrance'),
  SEED_DEVICE_KEY: z.string().default('demo-kiosk-key-12345'),
  SEED_DEMO_STUDENTS: boolString(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message; never print secrets.
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  // eslint-disable-next-line no-console
  console.error('Invalid backend environment configuration:\n' + issues.join('\n'));
  throw new Error('Invalid backend environment configuration');
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  face: {
    provider: env.FACE_PROVIDER,
    modelPath: path.resolve(env.FACE_MODEL_PATH),
    matchThreshold: env.FACE_MATCH_THRESHOLD,
    minConfidence: env.FACE_MIN_CONFIDENCE,
    maxImageBytes: env.FACE_MAX_IMAGE_BYTES,
  },
  storageDir: path.resolve(env.STORAGE_DIR),
  saveScanImages: env.SAVE_SCAN_IMAGES,
  maxUploadBytes: Math.min(env.MAX_UPLOAD_MB * 1024 * 1024, env.FACE_MAX_IMAGE_BYTES),
  rateLimitDisabled: env.RATE_LIMIT_DISABLED,
  logLevel: env.LOG_LEVEL,
  seed: {
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    adminName: env.SEED_ADMIN_NAME,
    deviceName: env.SEED_DEVICE_NAME,
    deviceLocation: env.SEED_DEVICE_LOCATION,
    deviceKey: env.SEED_DEVICE_KEY,
    demoStudents: env.SEED_DEMO_STUDENTS,
  },
} as const;

export type Config = typeof config;
