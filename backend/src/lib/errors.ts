/** Error codes defined by docs/API.md. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FACE_ALREADY_ENROLLED'
  | 'FILE_TOO_LARGE'
  | 'FACE_NOT_DETECTED'
  | 'INTERNAL_ERROR'
  | 'FACE_SERVICE_UNAVAILABLE';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (message = 'Invalid request', details?: unknown) =>
    new ApiError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') =>
    new ApiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Insufficient permissions') => new ApiError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (message = 'Resource conflict') => new ApiError(409, 'CONFLICT', message),
  faceAlreadyEnrolled: (message = 'This face is already enrolled to another student') =>
    new ApiError(409, 'FACE_ALREADY_ENROLLED', message),
  fileTooLarge: (message = 'Image exceeds the maximum upload size') =>
    new ApiError(413, 'FILE_TOO_LARGE', message),
  faceNotDetected: (message = 'No single usable face detected in the image') =>
    new ApiError(422, 'FACE_NOT_DETECTED', message),
  faceServiceUnavailable: (message = 'Face recognition service is not available yet') =>
    new ApiError(503, 'FACE_SERVICE_UNAVAILABLE', message),
  internal: (message = 'Unexpected server error') => new ApiError(500, 'INTERNAL_ERROR', message),
};
