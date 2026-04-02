import { Request, Response, NextFunction } from 'express';

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