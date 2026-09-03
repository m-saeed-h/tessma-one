import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConsoleEmailProvider } from './providers/console-email.provider';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

// Charter §5.2 platform/notifications: "in-app, email, push, SMS channels."
// IN_APP needs no external delivery — the row itself is the delivery.
// EMAIL is wired to a dev-mode provider (see providers/console-email.provider.ts).
// SMS/PUSH are declared here (the interface exists, the channel enum
// includes them) but have no provider wired: sending on either records a
// FAILED row rather than silently pretending to succeed. Genuinely finishing
// them means selecting and contracting a provider (Twilio, FCM/APNs), which
// is a product decision this scaffold doesn't make on the team's behalf.
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private emailProvider: ConsoleEmailProvider) {}

  // Takes an existing transaction (like AuditService.write) so a caller
  // already inside a `forTenant` block — e.g. Finance posting an invoice and
  // notifying the issuer in the same unit of work — doesn't open a second,
  // independent transaction to do it.
  async send(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
    subject: string,
    body: string,
  ) {
    let status: 'SENT' | 'FAILED' = 'SENT';
    if (channel === 'EMAIL') {
      await this.emailProvider.send({ tenantId, userId, subject, body });
    } else if (channel === 'SMS' || channel === 'PUSH') {
      status = 'FAILED';
    }
    return tx.notification.create({ data: { tenantId, userId, channel, subject, body, status } });
  }

  async listForUser(tenantId: string, userId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.notification.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async markRead(tenantId: string, userId: string, id: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const notification = await tx.notification.findUnique({ where: { id } });
      if (!notification) throw new NotFoundException({ code: 'notification.not_found', message: 'No such notification.' });
      // Object-level check (Charter §10.2): holding notification-read is not
      // the right to mark ANY notification read, only your own.
      if (notification.userId !== userId) {
        throw new ForbiddenException({ code: 'notification.not_yours', message: 'This notification does not belong to you.' });
      }
      return tx.notification.update({ where: { id }, data: { status: 'READ', readAt: new Date() } });
    });
  }
}
