/**
 * HTTP Error Types
 *
 * Typed errors for consistent HTTP response handling.
 * Use these instead of throwing generic Error objects.
 */

/**
 * Base class for HTTP errors with status codes
 */
export abstract class HttpError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * 401 Unauthorized - User is not authenticated
 */
export class AuthenticationError extends HttpError {
  readonly statusCode = 401;

  constructor(message = "Unauthorized") {
    super(message);
  }
}

/**
 * 403 Forbidden - User is authenticated but not authorized
 */
export class ForbiddenError extends HttpError {
  readonly statusCode = 403;

  constructor(message = "Forbidden") {
    super(message);
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends HttpError {
  readonly statusCode = 404;

  constructor(message = "Not found") {
    super(message);
  }
}

/**
 * 400 Bad Request - Invalid input or malformed request
 */
export class BadRequestError extends HttpError {
  readonly statusCode = 400;

  constructor(message = "Bad request") {
    super(message);
  }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
export class ConflictError extends HttpError {
  readonly statusCode = 409;

  constructor(message = "Conflict") {
    super(message);
  }
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export class ValidationError extends HttpError {
  readonly statusCode = 422;
  readonly errors: Record<string, string[]>;

  constructor(message = "Validation failed", errors: Record<string, string[]> = {}) {
    super(message);
    this.errors = errors;
  }
}
