import { LoggerService } from '@nestjs/common';

// NFR-K8S-10: logs emitted to standard output as structured JSON, not to
// local files, so diagnosis in a container platform never depends on
// reproducing an issue against a specific instance's disk.
function emit(level: string, message: unknown, context?: string) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level, message, context, time: new Date().toISOString() }));
}

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    emit('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string) {
    emit('error', message, context);
    if (trace) emit('error', trace, context);
  }
  warn(message: unknown, context?: string) {
    emit('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    emit('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    emit('verbose', message, context);
  }
}
