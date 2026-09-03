import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// AP-08 "one error contract" / SEC-APP-09: every error response has the same
// shape, `{ error: { code, message, details? } }`, and an unexpected
// (non-HttpException) failure never leaks a stack trace, SQL, or an internal
// identifier to the client — it is logged server-side and a generic message
// goes out instead.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let message = 'An unexpected error occurred.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = defaultCode(status);
      message = exception.message;

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (Array.isArray(b.message)) {
          // Nest's built-in ValidationPipe-style array-of-strings shape.
          message = 'Request failed validation.';
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (b.details !== undefined) details = b.details;
        if (b.required !== undefined) details = { ...(typeof details === 'object' ? details : {}), required: b.required };
        if (b.featureKey !== undefined) details = { ...(typeof details === 'object' ? details : {}), featureKey: b.featureKey };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      // `findUniqueOrThrow`/`findFirstOrThrow` on a row that either doesn't
      // exist or (far more often here) belongs to a different tenant and was
      // filtered out by row-level security — both cases are indistinguishable
      // from the caller's side and both mean "not found", not "server broke".
      status = HttpStatus.NOT_FOUND;
      code = 'not_found';
      message = 'The requested resource was not found.';
    } else {
      // Unknown/unexpected error: log full detail server-side, tell the client nothing.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST: return 'bad_request';
    case HttpStatus.UNAUTHORIZED: return 'unauthorized';
    case HttpStatus.FORBIDDEN: return 'forbidden';
    case HttpStatus.NOT_FOUND: return 'not_found';
    case HttpStatus.CONFLICT: return 'conflict';
    default: return 'internal_error';
  }
}
