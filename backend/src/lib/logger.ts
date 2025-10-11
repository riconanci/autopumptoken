import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// Create transports array
const transports: winston.transport[] = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    ),
  }),
];

// Only add file transport if NOT on Vercel (local development only)
if (!isVercel) {
  try {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.json(),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.json(),
      })
    );
  } catch (error) {
    console.warn('File logging disabled (no write permissions)');
  }
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports,
});

// Export convenient log methods
export const log = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  
  // Error can accept (message, meta) OR (message, error, meta)
  error: (message: string, errorOrMeta?: any, meta?: any) => {
    if (meta !== undefined) {
      // 3 arguments: (message, error, meta)
      const errorInfo = errorOrMeta instanceof Error 
        ? { error: errorOrMeta.message, stack: errorOrMeta.stack }
        : { error: errorOrMeta };
      logger.error(message, { ...errorInfo, ...meta });
    } else if (errorOrMeta !== undefined) {
      // 2 arguments: (message, meta or error)
      if (errorOrMeta instanceof Error) {
        logger.error(message, { error: errorOrMeta.message, stack: errorOrMeta.stack });
      } else {
        logger.error(message, errorOrMeta);
      }
    } else {
      // 1 argument: just message
      logger.error(message);
    }
  },
  
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  monitor: (message: string, meta?: any) => logger.info(`[MONITOR] ${message}`, meta),
  claim: (message: string, meta?: any) => logger.info(`[CLAIM] ${message}`, meta),
  buyback: (message: string, meta?: any) => logger.info(`[BUYBACK] ${message}`, meta),
  burn: (message: string, meta?: any) => logger.info(`[BURN] ${message}`, meta),
  treasury: (message: string, meta?: any) => logger.info(`[TREASURY] ${message}`, meta),
  transaction: (message: string, meta?: any) => logger.info(`[TX] ${message}`, meta),
  api: (method: string, path: string, status: number, meta?: any) => {
    logger.info(`[API] ${method} ${path} - ${status}`, meta);
  },
};

export default logger;