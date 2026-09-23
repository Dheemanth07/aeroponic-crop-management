import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string = 'APP_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict with current resource state') {
    super(message, 409, 'CONFLICT');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

// Fastify centralized error handler plugin
export function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Zod request validation errors -> 400 Bad Request
  if (error instanceof ZodError) {
    const formatted = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed on input data',
      details: formatted
    });
  }

  // 2. Custom domain application errors (400, 404, 409)
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.code,
      message: error.message
    });
  }

  // 3. PostgreSQL database constraint errors
  const pgError = error as any;
  if (pgError.code) {
    // 23505 = unique constraint violation (e.g. duplicate code or active batch per tray)
    if (pgError.code === '23505') {
      const isTrayBatchConflict = 
        pgError.constraint === 'idx_one_active_batch_per_tray' || 
        pgError.message?.includes('batches');

      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: isTrayBatchConflict
          ? 'Tray already has an active batch. A tray can hold at most one active batch.'
          : 'A resource with this unique identifier already exists.'
      });
    }

    // 23503 = foreign key violation
    if (pgError.code === '23503') {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Referenced foreign key resource does not exist.'
      });
    }

    // 23514 = check constraint violation
    if (pgError.code === '23514') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Data violates check constraint.'
      });
    }
  }

  // 4. Fastify framework errors (e.g., malformed JSON body)
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || 'Error',
      message: error.message
    });
  }

  // 5. Unhandled internal server errors
  _request.log?.error(error);
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected internal error occurred.'
  });
}
