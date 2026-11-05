import { clearAdminSession, clearStudentSession, getAdminToken, getStudentToken } from './auth';

const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Base API URL without a trailing slash, e.g. `http://localhost:3001/api`. */
export const API_URL = RAW_BASE_URL.replace(/\/+$/, '');

export type ApiAuth = 'admin' | 'student' | 'none';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code = 'UNKNOWN_ERROR', status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function buildUrl(path: string, query?: QueryParams): string {
  const base = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Plain object serialised as JSON. */
  json?: unknown;
  /** Multipart body (do not set Content-Type manually). */
  formData?: FormData;
  auth?: ApiAuth;
  query?: QueryParams;
  signal?: AbortSignal;
  /** Skip the automatic 401 redirect (used by login forms). */
  redirectOnUnauthorized?: boolean;
}

function authToken(auth: ApiAuth): string | null {
  if (auth === 'admin') return getAdminToken();
  if (auth === 'student') return getStudentToken();
  return null;
}

function handleUnauthorized(auth: ApiAuth): void {
  if (typeof window === 'undefined') return;
  if (auth === 'admin') clearAdminSession();
  if (auth === 'student') clearStudentSession();
  window.dispatchEvent(new CustomEvent('checkin:unauthorized', { detail: { auth } }));
  const path = window.location.pathname;
  const loginPath = auth === 'student' ? '/student' : '/login';
  if (path !== loginPath) {
    const next = encodeURIComponent(`${path}${window.location.search}`);
    window.location.assign(`${loginPath}?expired=1&next=${next}`);
  }
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, formData, auth = 'admin', query, signal, redirectOnUnauthorized = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = authToken(auth);
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const url = buildUrl(path, query);

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal, cache: 'no-store' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      `Cannot reach the API at ${API_URL}. Check that the backend is running, that NEXT_PUBLIC_API_URL is correct, and that this origin is allowed by CORS.`,
      'NETWORK_ERROR',
      0,
    );
  }

  if (response.status === 401 && auth !== 'none' && redirectOnUnauthorized) {
    handleUnauthorized(auth);
    throw new ApiError('Your session has expired. Please sign in again.', 'UNAUTHORIZED', 401);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await parseJsonSafe(response)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    if (payload && payload.success === false) {
      throw new ApiError(payload.error.message || 'Request failed', payload.error.code, response.status, payload.error.details);
    }
    throw new ApiError(`Request failed with status ${response.status}`, 'INTERNAL_ERROR', response.status);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === false) {
      throw new ApiError(payload.error.message || 'Request failed', payload.error.code, response.status, payload.error.details);
    }
    return payload.data;
  }

  // Some endpoints (e.g. photo) may return raw content — callers should use `fetchBlob` for those.
  return payload as T;
}

async function fetchBlobWithAuth(path: string, query?: QueryParams, auth: ApiAuth = 'admin'): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = authToken(auth);
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { headers, cache: 'no-store' });
  } catch {
    throw new ApiError('Cannot reach the API. Check that the backend is running.', 'NETWORK_ERROR', 0);
  }
  if (response.status === 401 && auth !== 'none') {
    handleUnauthorized(auth);
    throw new ApiError('Your session has expired. Please sign in again.', 'UNAUTHORIZED', 401);
  }
  if (!response.ok) {
    const payload = (await parseJsonSafe(response)) as ErrorEnvelope | null;
    throw new ApiError(
      payload && payload.success === false ? payload.error.message : `Request failed with status ${response.status}`,
      payload && payload.success === false ? payload.error.code : 'INTERNAL_ERROR',
      response.status,
    );
  }
  return response.blob();
}

export const api = {
  get<T>(path: string, query?: QueryParams, options?: Omit<RequestOptions, 'method' | 'query'>): Promise<T> {
    return request<T>(path, { ...options, method: 'GET', query });
  },
  post<T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'method' | 'json'>): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', json });
  },
  patch<T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'method' | 'json'>): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', json });
  },
  put<T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'method' | 'json'>): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', json });
  },
  delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
  upload<T>(path: string, formData: FormData, options?: Omit<RequestOptions, 'method' | 'formData'>): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', formData });
  },
  blob(path: string, query?: QueryParams, auth: ApiAuth = 'admin'): Promise<Blob> {
    return fetchBlobWithAuth(path, query, auth);
  },
  /**
   * Authenticated CSV/file download. Bearer tokens cannot be sent by a plain <a href>,
   * so exports are fetched and saved through a temporary object URL.
   */
  async download(path: string, query: QueryParams | undefined, fallbackFilename: string, auth: ApiAuth = 'admin'): Promise<void> {
    const headers: Record<string, string> = {};
    const token = authToken(auth);
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetch(buildUrl(path, query), { headers, cache: 'no-store' });
    } catch {
      throw new ApiError('Cannot reach the API. Check that the backend is running.', 'NETWORK_ERROR', 0);
    }
    if (response.status === 401 && auth !== 'none') {
      handleUnauthorized(auth);
      throw new ApiError('Your session has expired. Please sign in again.', 'UNAUTHORIZED', 401);
    }
    if (!response.ok) {
      const payload = (await parseJsonSafe(response)) as ErrorEnvelope | null;
      throw new ApiError(
        payload && payload.success === false ? payload.error.message : `Export failed with status ${response.status}`,
        payload && payload.success === false ? payload.error.code : 'EXPORT_FAILED',
        response.status,
      );
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : fallbackFilename;

    const { downloadBlob } = await import('./utils');
    downloadBlob(blob, filename);
  },
};

/** Human-friendly text for an API error, including known error codes from the contract. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return error.message;
      case 'FACE_NOT_DETECTED':
        return 'No usable face was detected. Face the camera straight on, in good light, and try again.';
      case 'FACE_ALREADY_ENROLLED':
        return 'This face is already enrolled to another student. Contact an administrator.';
      case 'FACE_SERVICE_UNAVAILABLE':
        return 'The face recognition service is temporarily unavailable. Please try again shortly.';
      case 'FILE_TOO_LARGE':
        return 'The image is too large. Please capture a smaller photo (max 8 MB).';
      case 'CONFLICT':
        return error.message || 'This record already exists.';
      case 'VALIDATION_ERROR':
        return error.message || 'Please check the highlighted fields.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
