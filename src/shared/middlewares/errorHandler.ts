import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  let error = { ...err };
  error.message = err.message;


  console.error(err);


  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
  }


  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue)[0];
    const message = `${field} already exists`;
    error = new AppError(message, 400);
  }


  if (err.name === 'ValidationError') {
    const messages = Object.values((err as any).errors).map((val: any) => val.message);
    const message = messages.join(', ');
    error = new AppError(message, 400);
  }


  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AppError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AppError(message, 401);
  }

  if (err instanceof multer.MulterError) {
    const field = (err as any).field;
    const fieldLimits: Record<string, number> = { images: 5, files: 3 };
    let message = err.message;
    switch (err.code) {
      case 'LIMIT_UNEXPECTED_FILE':
        if (field && fieldLimits[field] !== undefined) {
          message = `Too many files uploaded for "${field}". Maximum allowed is ${fieldLimits[field]}.`;
        } else {
          message = `Unexpected file field "${field}".`;
        }
        break;
      case 'LIMIT_FILE_SIZE':
        message = `File "${field}" is too large.`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded.';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in the multipart request.';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name is too long.';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = `Field "${field}" value is too long.`;
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in the request.';
        break;
    }
    error = new AppError(message, 400);
  }

  const statusCode = (error as any).statusCode || 500;
  const message = error.message || 'Internal Server Error';

  // Include additional properties if they exist on the error
  const additionalData: any = {};
  if ((error as any).reviewRequired) additionalData.reviewRequired = (error as any).reviewRequired;
  if ((error as any).order) additionalData.order = (error as any).order;
  if ((error as any).availableJobTitles) additionalData.availableJobTitles = (error as any).availableJobTitles;
  if ((error as any).callId) additionalData.callId = (error as any).callId;

  res.status(statusCode).json({
    success: false,
    message,
    ...additionalData,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};