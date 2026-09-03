import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannelProvider, NotificationRequest } from '../notification-channel.interface';

// Dev-mode transport: logs instead of sending, so the demo/CI environment
// never needs real SMTP credentials. A real provider (SES, Postmark, ...)
// implementing the same interface is a configuration swap — see
// notifications.service.ts and Charter §8's "provider-independent" pattern.
@Injectable()
export class ConsoleEmailProvider implements NotificationChannelProvider {
  private readonly logger = new Logger('EmailNotification(dev)');

  async send(req: NotificationRequest): Promise<void> {
    this.logger.log(`tenant=${req.tenantId} user=${req.userId} subject="${req.subject}"`);
  }
}
