import { Injectable, Logger } from '@nestjs/common';
import type { InvoiceEmailProvider, InvoiceEmailRequest, InvoiceEmailResult } from './invoice-email.provider';

// Real transport for FR-SIN-010, via Resend's HTTP API (no SMTP, no extra
// dependency — plain fetch). Selected over ConsoleInvoiceEmailProvider in
// app.module.ts when RESEND_API_KEY is set.
@Injectable()
export class ResendInvoiceEmailProvider implements InvoiceEmailProvider {
  private readonly logger = new Logger('InvoiceEmail(resend)');

  async send(req: InvoiceEmailRequest): Promise<InvoiceEmailResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
          to: req.to,
          cc: req.cc,
          bcc: req.bcc,
          subject: req.subject,
          text: req.body,
          attachments: [
            { filename: req.attachment.filename, content: req.attachment.buffer.toString('base64') },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`Resend send failed (${res.status}): ${detail}`);
        return { status: 'FAILED', failureReason: `Resend responded ${res.status}` };
      }
      return { status: 'SENT' };
    } catch (err) {
      this.logger.error(`Resend send threw: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'FAILED', failureReason: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
