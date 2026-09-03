import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// The application connects as the RESTRICTED role (APP_DATABASE_URL), so
// PostgreSQL row-level security is actually enforced (a superuser/owner bypasses it).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      datasources: { db: { url: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL } },
    });
  }
  async onModuleInit() {
    await this.$connect();
  }

  // Run all work for a request inside ONE transaction that sets the tenant as a
  // TRANSACTION-LOCAL setting (set_config(..., true)). Transaction-local means it
  // cannot leak to the next request that reuses the pooled connection — this is
  // the crux of making RLS safe with a connection pool.
  async forTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant', $1, true)`,
        tenantId,
      );
      return fn(tx);
    });
  }
}
