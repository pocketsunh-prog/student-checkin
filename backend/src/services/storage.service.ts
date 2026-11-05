import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env';
import { ApiError, errors } from '../lib/errors';

export const FACES_DIR = 'faces';
export const SCANS_DIR = 'scans';

export async function initStorage(): Promise<void> {
  await fs.mkdir(path.join(config.storageDir, FACES_DIR), { recursive: true });
  await fs.mkdir(path.join(config.storageDir, SCANS_DIR), { recursive: true });
}

function safeFileId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function resolveStoragePath(relativePath: string): string {
  const root = path.resolve(config.storageDir);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw errors.notFound('File not found');
  }
  return absolute;
}

/** Persist a face photo and return its path relative to STORAGE_DIR. */
export async function saveFacePhoto(
  studentId: string,
  buffer: Buffer,
  extension: string,
): Promise<string> {
  const fileName = `${safeFileId(studentId)}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString('hex')}${extension}`;
  const relativePath = path.posix.join(FACES_DIR, fileName);
  const absolutePath = resolveStoragePath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

/** Persist a kiosk scan frame when SAVE_SCAN_IMAGES=true. */
export async function saveScanImage(buffer: Buffer, extension: string): Promise<string> {
  const fileName = `${crypto.randomUUID()}${extension}`;
  const relativePath = path.posix.join(SCANS_DIR, fileName);
  const absolutePath = resolveStoragePath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

export async function deleteStoredFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    await fs.unlink(resolveStoragePath(relativePath));
  } catch {
    /* best effort cleanup */
  }
}

export async function readStoredFile(relativePath: string | null | undefined): Promise<Buffer> {
  if (!relativePath) throw errors.notFound('Photo not found');
  try {
    return await fs.readFile(resolveStoragePath(relativePath));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw errors.notFound('Photo not found');
  }
}
