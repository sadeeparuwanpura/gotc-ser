import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HttpError, type ErrorCode, type ErrorDetails } from '../utils/http-error';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';

/**
 * The one place a response body is shaped for an error. Every failure — thrown, rejected,
 * zod, mongo — leaves here as:
 *   { "error": { "code": …, "message": …, "details"?: … } }
 */

interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

function body(code: ErrorCode, message: string, details?: ErrorDetails): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Turns a zod failure into the field list the client renders under its inputs. */
function fromZod(error: ZodError): { status: number; payload: ErrorBody } {
  const issues = error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message
  }));
  const first = issues[0];
  return {
    status: 422,
    payload: body('VALIDATION_FAILED', first ? first.message : 'The request could not be validated.', { issues })
  };
}

function fromMongoose(error: mongoose.Error.ValidationError): { status: number; payload: ErrorBody } {
  const issues = Object.values(error.errors).map((detail) => ({
    field: detail.path,
    message: detail.message
  }));
  const first = issues[0];
  return {
    status: 422,
    payload: body('VALIDATION_FAILED', first ? first.message : 'The record could not be saved.', { issues })
  };
}

function isDuplicateKeyError(error: unknown): error is { code: number; keyValue?: Record<string, unknown> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}.`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(body(error.code, error.message, error.details));
    return;
  }

  if (error instanceof ZodError) {
    const { status, payload } = fromZod(error);
    res.status(status).json(payload);
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const { status, payload } = fromMongoose(error);
    res.status(status).json(payload);
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(404).json(body('NOT_FOUND', 'That record does not exist.'));
    return;
  }

  if (isDuplicateKeyError(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? 'value';
    res.status(409).json(body('DUPLICATE', `That ${field} is already taken.`, { field }));
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.error({ err: error }, `Unhandled error: ${message}`);
  res
    .status(500)
    .json(body('INTERNAL', isProduction ? 'Something went wrong on the server.' : message));
};
