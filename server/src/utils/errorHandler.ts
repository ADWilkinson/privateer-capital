import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: ApiError, 
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  
  // Only log detailed errors in development
  if (process.env.NODE_ENV === 'development') {
    logger.error('ERROR 💥', {
      statusCode: err.statusCode,
      message: err.message,
      stack: err.stack,
      path: req.originalUrl
    });
  } else {
    logger.error(`ERROR: ${err.statusCode} - ${err.message} - ${req.originalUrl}`);
  }

  // Don't expose error details in production
  const response = {
    status: 'error',
    message: process.env.NODE_ENV === 'production' && err.statusCode === 500
      ? 'Internal server error'
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: Date.now()
  };

  res.status(err.statusCode).json(response);
};

// Add an asyncHandler to handle async route exceptions
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
