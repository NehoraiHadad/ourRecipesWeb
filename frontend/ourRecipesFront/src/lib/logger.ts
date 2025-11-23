/**
 * Centralized logger using Pino
 */
import pino from 'pino';

/**
 * Logger configuration based on environment
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Create logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Production: JSON logs for parsing
  // Development: Pretty print for readability
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false
      }
    }
  }),

  // Base fields for all logs
  base: {
    env: process.env.NODE_ENV,
    revision: process.env.VERCEL_GIT_COMMIT_SHA || 'local'
  },

  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'secret',
      '*.password',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    remove: true
  }
});

/**
 * Create child logger with context
 */
export function createLogger(context: string | object) {
  if (typeof context === 'string') {
    return logger.child({ context });
  }
  return logger.child(context);
}

/**
 * Type-safe log levels
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Structured log data
 */
export interface LogData {
  [key: string]: any;
}

/**
 * Helper: Log with structured data
 */
export function log(
  level: LogLevel,
  message: string,
  data?: LogData
): void {
  if (data) {
    logger[level](data, message);
  } else {
    logger[level](message);
  }
}

// Export logger as default
export default logger;
