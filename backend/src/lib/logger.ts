import { config } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const REDACT_KEY = /pass(word)?|descriptor|token|api[_-]?key|authorization|secret|jwt/i;
const MAX_DEPTH = 4;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    // Face descriptors are numeric arrays; never emit arrays longer than a few items.
    if (value.length > 16) return `[array(${value.length})]`;
    return value.map((entry) => sanitize(entry, depth + 1));
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = REDACT_KEY.test(key) ? '[redacted]' : sanitize(entry, depth + 1);
  }
  return output;
}

function emit(level: Exclude<LogLevel, 'silent'>, message: string, meta?: unknown): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[config.logLevel]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const args: unknown[] = meta === undefined ? [line] : [line, sanitize(meta)];
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(...args);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(...args);
  } else {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
