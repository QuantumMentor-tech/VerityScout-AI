import 'server-only';
import { type LogLevel } from '@/lib/config/server-env';

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly context?: Record<string, unknown>;
}

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /authorization/i,
  /cookie/i,
  /privatekey/i,
  /private_key/i,
  /session/i,
  /connectionstring/i,
  /databaseurl/i,
  /db_url/i,
];

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const API_KEY_PATTERN = /\b(sk-[A-Za-z0-9_-]{20,})\b/gi;
const JWT_PATTERN = /\b(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/gi;
const URL_CREDENTIAL_PATTERN = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:]+):([^@]+)@/g;
const URL_SENSITIVE_PARAM_PATTERN = /([?&](?:token|key|api_key|secret|password)=)[^&#\s]*/gi;

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 50;

/**
 * Sanitizes an arbitrary string value to remove credential-shaped substrings and prevent log injection.
 */
export function sanitizeString(value: string): string {
  if (value.length > MAX_STRING_LENGTH) {
    value = `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`;
  }

  // Defend against log-splitting injection by removing carriage returns and newlines
  const singleLine = value.replace(/[\r\n]+/g, ' ');

  return singleLine
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(API_KEY_PATTERN, '[REDACTED_API_KEY]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(URL_CREDENTIAL_PATTERN, '$1$2:[REDACTED]@')
    .replace(URL_SENSITIVE_PARAM_PATTERN, '$1[REDACTED]');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively sanitizes structured objects, stripping sensitive keys and sanitizing string values.
 * Employs a WeakSet to guard against circular object graphs.
 */
export function sanitizeContext(
  obj: unknown,
  depth = 0,
  visited = new WeakSet<object>()
): unknown {
  if (depth > MAX_DEPTH) {
    return '[EXCEEDED_MAX_DEPTH]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizeString(obj.message),
    };
  }

  if (typeof obj === 'object') {
    if (visited.has(obj)) {
      return '[CIRCULAR_REFERENCE]';
    }
    visited.add(obj);

    if (Array.isArray(obj)) {
      const slice = obj.slice(0, MAX_ARRAY_LENGTH);
      const sanitizedArray = slice.map((item) => sanitizeContext(item, depth + 1, visited));
      if (obj.length > MAX_ARRAY_LENGTH) {
        sanitizedArray.push(`[${obj.length - MAX_ARRAY_LENGTH} MORE ITEMS TRUNCATED]`);
      }
      return sanitizedArray;
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizeContext(val, depth + 1, visited);
      }
    }
    return sanitizedObj;
  }

  return String(obj);
}

export class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public getLevel(): LogLevel {
    return this.minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.minLevel];
  }

  private formatRecord(
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): string {
    try {
      const record: LogRecord = {
        timestamp: new Date().toISOString(),
        level,
        event: sanitizeString(event),
        message: sanitizeString(message),
        ...(correlationId ? { correlationId: sanitizeString(correlationId) } : {}),
        ...(context ? { context: sanitizeContext(context) as Record<string, unknown> } : {}),
      };

      return JSON.stringify(record);
    } catch {
      // Fail closed: emit minimal emergency record without touching raw context
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'LOG_SERIALIZATION_FAILED',
        message: 'Context could not be safely serialized',
        error: '[REDACTED_SANITIZATION_FAILED]',
      });
    }
  }

  private write(level: LogLevel, recordJson: string): void {
    const output = `${recordJson}\n`;
    if (level === 'error') {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }

  public log(
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const recordJson = this.formatRecord(level, event, message, context, correlationId);
    this.write(level, recordJson);
  }

  public debug(event: string, message: string, context?: Record<string, unknown>, correlationId?: string): void {
    this.log('debug', event, message, context, correlationId);
  }

  public info(event: string, message: string, context?: Record<string, unknown>, correlationId?: string): void {
    this.log('info', event, message, context, correlationId);
  }

  public warn(event: string, message: string, context?: Record<string, unknown>, correlationId?: string): void {
    this.log('warn', event, message, context, correlationId);
  }

  public error(event: string, message: string, context?: Record<string, unknown>, correlationId?: string): void {
    this.log('error', event, message, context, correlationId);
  }
}

/**
 * Global application logger instance initialized with safe defaults.
 */
export const logger = new Logger('info');
