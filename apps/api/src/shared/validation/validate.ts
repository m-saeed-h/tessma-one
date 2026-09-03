import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

// Every controller that accepts a body calls this before touching it. On
// failure the exception filter turns this into the standard error contract
// with a `details` array of {path, message} — never a raw stack trace.
export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException({
      code: 'validation.failed',
      message: 'Request failed validation.',
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
