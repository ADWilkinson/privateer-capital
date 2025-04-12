import winston from 'winston';

// Helper function to handle circular references in objects
const safeStringify = (obj: any) => {
  // Create a new cache for each call to prevent memory leaks
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    // Handle Error objects specially
    if (value instanceof Error) {
      return {
        message: value.message,
        stack: value.stack,
        ...(value as any) // spread any additional properties
      };
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    return value;
  }, 2);
};

// Custom stringifier for objects
const objectStringifier = (obj: any) => {
  if (typeof obj === 'object' && obj !== null) {
    // If it's a string object, convert to string
    if (Object.prototype.toString.call(obj) === '[object String]') {
      return String(obj);
    }
    // Return proper JSON string instead of character-by-character output
    return safeStringify(obj);
  } else if (typeof obj === 'string') {
    // If it's already a string, return it directly
    return obj;
  } else if (typeof obj === 'number' || typeof obj === 'boolean') {
    // For numbers and booleans, convert to string
    return String(obj);
  }
  return String(obj);
};

// Create a custom logger with better formatting
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Format for Cloud Run structured logs
      return JSON.stringify({
        timestamp,
        severity: level.toUpperCase(),
        message,
        ...meta
      });
    })
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error', 'warn'],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level.toUpperCase()}] ${message} ${safeStringify(meta)}`;
        })
      )
    })
  ]
});

// Add a custom error handler
export const errorHandler = (error: any) => {
  logger.error('Error:', {
    error: error,
    stack: error.stack,
    message: error.message
  });
};