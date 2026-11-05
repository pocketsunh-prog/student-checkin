import multer from 'multer';
import { config } from '../config/env';

/**
 * Images are buffered in memory (8 MB max by default); magic bytes are validated
 * by the route/service layer, so the client MIME type is not trusted.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});
