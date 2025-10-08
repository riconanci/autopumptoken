import winston from 'winston';
import { logLevel } from '../env';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  
  // Add stack trace for errors
  if (stack) {
    log += `\n${stack}`;
  }
  
  return log;
});

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: combine(
    errors({ stack: true }), // Include stack traces
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// Helper methods for structured logging
export const log = {
  claim: (message: string, meta?: any) => {
    logger.info(`[CLAIM] ${message}`, meta);
  },
  
  buyback: (message: string, meta?: any) => {
    logger.info(`[BUYBACK] ${message}`, meta);
  },
  
  burn: (message: string, meta?: any) => {
    logger.info(`[BURN] ${message}`, meta);
  },
  
  monitor: (message: string, meta?: any) => {
    logger.info(`[MONITOR] ${message}`, meta);
  },
  
  treasury: (message: string, meta?: any) => {
    logger.info(`[TREASURY] ${message}`, meta);
  },
  
  transaction: (message: string, signature?: string, meta?: any) => {
    logger.info(`[TX] ${message}`, { signature, ...meta });
  },
  
  api: (method: string, path: string, status: number, meta?: any) => {
    logger.info(`[API] ${method} ${path} - ${status}`, meta);
  },
  
  error: (message: string, error?: Error | any, meta?: any) => {
    logger.error(message, {
      error: error?.message || error,
      stack: error?.stack,
      ...meta,
    });
  },
  
  debug: (message: string, meta?: any) => {
    logger.debug(message, meta);
  },
  
  warn: (message: string, meta?: any) => {
    logger.warn(message, meta);
  },
  
  info: (message: string, meta?: any) => {
    logger.info(message, meta);
  },
};

// Export logger for direct use
export default logger;