import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { penceToGBP } from '../../../shared/money/money';

// FR-SIN-009: "a branded PDF containing all particulars legally required of
// a VAT invoice" — seller name/address/VAT number, invoice number and date,
// customer name and address, a description/quantity/unit price/VAT rate per
// line, and the VAT-exclusive total, total VAT and grand total. A DRAFT has
// no allocated number yet (FR-SIN-005), so it renders as a clearly marked
// preview, not a document a customer could mistake for a real invoice.
interface FinanceProfile {
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  vatNumber: string | null;
  companyNumber: string | null;
  footerText: string | null;
}

interface InvoiceForPdf {
  number: string | null;
  status: string;
  issueDate: Date | null;
  dueDate: Date | null;
  purchaseOrderRef: string | null;
  terms: string | null;
  netTotal: bigint;
  vatTotal: bigint;
  grossTotal: bigint;
  lines: Array<{
    description: string; quantity: number; unitPrice: bigint;
    discountPct: number; vatRatePct: number; total: bigint;
  }>;
  party: {
    legalName: string; addressLine1: string | null; addressLine2: string | null;
    city: string | null; postcode: string | null; country: string | null; vatNumber: string | null;
  };
}

@Injectable()
export class InvoicePdfService {
  async generate(
    invoice: InvoiceForPdf,
    tenantName: string,
    profile: FinanceProfile | null,
    primaryColor: string,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const isDraft = invoice.status === 'DRAFT';
    const sellerName = profile?.legalName || tenantName;

    doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold')
      .text(isDraft ? 'DRAFT — NOT A VAT INVOICE' : 'TAX INVOICE', { align: 'right' });
    doc.fillColor('#000000').fontSize(10).font('Helvetica');

    // Seller block (top left).
    doc.font('Helvetica-Bold').text(sellerName);
    doc.font('Helvetica');
    for (const line of addressLines(profile)) doc.text(line);
    if (profile?.vatNumber) doc.text(`VAT registration: ${profile.vatNumber}`);
    if (profile?.companyNumber) doc.text(`Company number: ${profile.companyNumber}`);

    // Invoice metadata (top right).
    const metaTop = 80;
    doc.fontSize(10);
    const meta: Array<[string, string]> = [
      ['Invoice number', invoice.number ?? 'DRAFT — not yet issued'],
      ['Issue date', formatDate(invoice.issueDate)],
      ['Due date', formatDate(invoice.dueDate)],
    ];
    if (invoice.purchaseOrderRef) meta.push(['Purchase order', invoice.purchaseOrderRef]);
    let metaY = metaTop;
    for (const [label, value] of meta) {
      doc.font('Helvetica-Bold').text(label, 350, metaY, { width: 190 });
      doc.font('Helvetica').text(value, 350, metaY + 12, { width: 190 });
      metaY += 30;
    }
    doc.y = Math.max(doc.y, metaY) + 10;

    // Bill To.
    doc.font('Helvetica-Bold').text('Bill to');
    doc.font('Helvetica').text(invoice.party.legalName);
    for (const line of addressLines(invoice.party)) doc.text(line);
    if (invoice.party.vatNumber) doc.text(`VAT registration: ${invoice.party.vatNumber}`);
    doc.moveDown(1.5);

    // Line items table.
    const tableTop = doc.y;
    const cols = { desc: 50, qty: 280, price: 330, disc: 390, vat: 430, total: 480 };
    doc.font('Helvetica-Bold');
    doc.text('Description', cols.desc, tableTop);
    doc.text('Qty', cols.qty, tableTop, { width: 40, align: 'right' });
    doc.text('Unit £', cols.price, tableTop, { width: 50, align: 'right' });
    doc.text('Disc %', cols.disc, tableTop, { width: 35, align: 'right' });
    doc.text('VAT %', cols.vat, tableTop, { width: 40, align: 'right' });
    doc.text('Total £', cols.total, tableTop, { width: 65, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica');

    for (const line of invoice.lines) {
      const y = doc.y;
      doc.text(line.description, cols.desc, y, { width: 220 });
      doc.text(String(line.quantity), cols.qty, y, { width: 40, align: 'right' });
      doc.text(penceToGBP(line.unitPrice).replace('£', ''), cols.price, y, { width: 50, align: 'right' });
      doc.text(String(line.discountPct), cols.disc, y, { width: 35, align: 'right' });
      doc.text(String(line.vatRatePct), cols.vat, y, { width: 40, align: 'right' });
      doc.text(penceToGBP(line.total).replace('£', ''), cols.total, y, { width: 65, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    // Totals. Label and value are separate fixed columns (not `continued`
    // text) so a bold, wider label like "Total due" can never crowd its
    // amount — continued text advances the cursor by the label's own
    // rendered width, which varies with font weight.
    const totalsLabelX = 400, totalsValueX = 480;
    let totalsY = doc.y;
    doc.font('Helvetica').text('Net total', totalsLabelX, totalsY, { width: 75 });
    doc.text(penceToGBP(invoice.netTotal), totalsValueX, totalsY, { width: 65, align: 'right' });
    totalsY += 16;
    doc.text('VAT total', totalsLabelX, totalsY, { width: 75 });
    doc.text(penceToGBP(invoice.vatTotal), totalsValueX, totalsY, { width: 65, align: 'right' });
    totalsY += 16;
    doc.font('Helvetica-Bold');
    doc.text('Total due', totalsLabelX, totalsY, { width: 75 });
    doc.text(penceToGBP(invoice.grossTotal), totalsValueX, totalsY, { width: 65, align: 'right' });
    doc.y = totalsY + 20;
    doc.font('Helvetica');

    // Reset to the left margin at full page width — the totals block above
    // left the cursor positioned in its narrow right-hand value column.
    doc.x = 50;
    if (invoice.terms) { doc.moveDown(1.5); doc.font('Helvetica').fontSize(9).text(`Terms: ${invoice.terms}`, 50, doc.y, { width: 495 }); }
    if (profile?.footerText) { doc.moveDown(1); doc.fontSize(9).fillColor('#666666').text(profile.footerText, 50, doc.y, { width: 495 }); }

    doc.end();
    return done;
  }
}

function addressLines(p: { addressLine1: string | null; addressLine2: string | null; city: string | null; postcode: string | null; country: string | null } | null): string[] {
  if (!p) return [];
  return [p.addressLine1, p.addressLine2, [p.city, p.postcode].filter(Boolean).join(' '), p.country]
    .filter((v): v is string => !!v && v.trim().length > 0);
}

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}
