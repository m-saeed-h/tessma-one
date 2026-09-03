import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/errors/http-exception.filter';
import { JsonLogger } from './shared/logging/json-logger';

// Serialise every BigInt (pence) as a string across all responses. Node's JSON
// serialiser throws on BigInt otherwise. This matches the Engineering Standards:
// money travels over the wire as a string of minor units.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });

  app.use(cookieParser());

  // credentials:true + an explicit origin (not `origin: true`) — required for
  // the browser to send/receive the httpOnly auth cookie cross-origin in dev
  // (API on :4000, web on :3000).
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });

  app.useGlobalFilters(new AllExceptionsFilter());

  // NFR-K8S-07: drain in-flight requests on SIGTERM rather than dying mid-request.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message: `Tessma One API on :${port}`, time: new Date().toISOString() }));
}
bootstrap();
