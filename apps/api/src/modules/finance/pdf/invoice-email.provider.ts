import { Injectable, Logger } from '@nestjs/common';

// FR-SIN-010: emailing an invoice to a customer — arbitrary external
// recipients with cc/bcc and a PDF attachment, distinct from the platform's
// internal, userId-addressed NotificationChannelProvider (see
// core/notifications). Dev-mode transport: logs instead of sending, so the
// demo/CI environment never needs real SMTP/ESP credentials. A real provider
// (SendGrid, Postmark, SES) implementing the same interface is a
// configuration swap.
//
// DELIVERED/OPENED/BOUNCED (FR-SIN-011/012) need a real ESP's webhook events
// to ever be true — this transport can only ever report SENT or FAILED, the
// same honest gap as SMS/PUSH in notifications.service.ts.
export interface InvoiceEmailAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface InvoiceEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachment: InvoiceEmailAttachment;
}

export interface InvoiceEmailResult {
  status: 'SENT' | 'FAILED';
  failureReason?: string;
}

@Injectable()
export class ConsoleInvoiceEmailProvider {
  private readonly logger = new Logger('InvoiceEmail(dev)');

  async send(req: InvoiceEmailRequest): Promise<InvoiceEmailResult> {
    this.logger.log(
      `to=${req.to.join(',')} cc=${(req.cc ?? []).join(',')} bcc=${(req.bcc ?? []).join(',')} ` +
      `subject="${req.subject}" attachment=${req.attachment.filename} (${req.attachment.buffer.length} bytes)`,
    );
    return { status: 'SENT' };
  }
}
