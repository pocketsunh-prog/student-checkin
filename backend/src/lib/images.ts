import type { Express } from 'express';
import { errors } from './errors';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageExt = '.jpg' | '.png' | '.webp';

export interface ImageType {
  mime: ImageMime;
  ext: ImageExt;
}

export interface UploadedImage {
  buffer: Buffer;
  mime: ImageMime;
  ext: ImageExt;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detect the real image type from magic bytes (never trust the client MIME type). */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

/**
 * Validate a multipart image upload and normalise it to a memory buffer.
 * Missing file -> 400; oversized -> 413; wrong/unreadable bytes -> 422.
 */
export function parseUploadedImage(
  file: Express.Multer.File | undefined,
  fieldName: string,
  maxBytes: number,
): UploadedImage {
  if (!file) {
    throw errors.validation('Image file is required', { [fieldName]: ['Image file is required'] });
  }
  if (file.size > maxBytes) {
    throw errors.fileTooLarge();
  }
  if (!file.buffer || file.buffer.length === 0) {
    throw errors.faceNotDetected('Empty image upload');
  }
  const type = detectImageType(file.buffer);
  if (!type) {
    throw errors.faceNotDetected('Unsupported or unreadable image. Send JPEG, PNG or WebP.');
  }
  return { buffer: file.buffer, mime: type.mime, ext: type.ext };
}

export function mimeForStoredImage(path: string): ImageMime {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
