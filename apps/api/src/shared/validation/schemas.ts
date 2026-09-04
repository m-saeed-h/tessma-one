import { z } from 'zod';

// SEC-APP-01: all input validated server-side against an explicit schema.
// Client-side validation (if any) is a usability feature only — these run
// regardless of what the caller sent.

export const registerSchema = z.object({
  company: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).toLowerCase(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).toLowerCase(),
  password: z.string().min(1).max(200),
});

// FR-PTY-002/003/005: shared fields across customer and supplier roles —
// both are just roles on the same Party.
const partyBaseSchema = {
  legalName: z.string().trim().min(1).max(300),
  type: z.enum(['COMPANY', 'INDIVIDUAL']).optional(),
  tradingName: z.string().trim().max(300).optional(),
  companyNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(30).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).optional(),
  notes: z.string().trim().max(2000).optional(),
};

export const createCustomerSchema = z.object({
  ...partyBaseSchema,
  paymentTerms: z.number().int().min(0).max(365).optional(),
  creditLimitPence: z.number().int().min(0).optional(),
  creditLimitBehaviour: z.enum(['WARN', 'BLOCK']).optional(),
  // FR-PTY-008: "warn before saving" — the client sees possible duplicates in
  // a 409 response and must resubmit with this set to actually create the
  // record, rather than the server silently deciding for them.
  confirmDuplicate: z.boolean().optional(),
});

// FR-PTY-013: bank details are optional at creation (a supplier can exist
// before their bank details are known) and are never stored in plaintext —
// see suppliers.service.ts.
export const createSupplierSchema = z.object({
  ...partyBaseSchema,
  paymentTerms: z.number().int().min(0).max(365).optional(),
  bankAccountName: z.string().trim().min(1).max(200).optional(),
  bankSortCode: z.string().trim().regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Expected a 6-digit sort code').optional(),
  bankAccountNumber: z.string().trim().regex(/^\d{6,10}$/, 'Expected a 6-10 digit account number').optional(),
  confirmDuplicate: z.boolean().optional(),
});

// FR-PTY-014: changing bank details requires re-authentication (the
// account's current password) and is a distinct, audited action.
export const updateSupplierBankDetailsSchema = z.object({
  password: z.string().min(1).max(200),
  bankAccountName: z.string().trim().min(1).max(200),
  bankSortCode: z.string().trim().regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Expected a 6-digit sort code'),
  bankAccountNumber: z.string().trim().regex(/^\d{6,10}$/, 'Expected a 6-10 digit account number'),
});

export const productSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  type: z.enum(['PRODUCT', 'SERVICE']).optional(),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  unit: z.string().trim().max(20).optional(),
  unitPricePence: z.number().int().min(0).max(1_000_000_000),
  purchasePricePence: z.number().int().min(0).max(1_000_000_000).optional(),
  vatRatePct: z.number().int().min(0).max(100).optional(),
  vatTreatment: z.enum(['STANDARD', 'REDUCED', 'ZERO', 'EXEMPT', 'OUTSIDE_SCOPE']).optional(),
});

export const invoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive().max(100_000),
  unitPrice: z.number().int().min(0).max(1_000_000_000), // pence, VAT-exclusive
  discountPct: z.number().int().min(0).max(100).optional(),
  vatRatePct: z.number().int().min(0).max(100).optional(),
});

export const createInvoiceDraftSchema = z.object({
  partyId: z.string().uuid(),
  purchaseOrderRef: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
  dueInDays: z.number().int().min(0).max(365).optional(),
  lines: z.array(invoiceLineSchema).min(1).max(200),
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const createQuotationSchema = z.object({
  partyId: z.string().uuid(),
  expiryDate: z.string().datetime().optional(),
  lines: z.array(invoiceLineSchema).min(1).max(200),
});

export const decideQuotationSchema = z.object({
  decision: z.enum(['ACCEPTED', 'DECLINED']),
});

const creditNoteLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive().max(100_000),
  unitPrice: z.number().int().min(0).max(1_000_000_000),
  vatRatePct: z.number().int().min(0).max(100).optional(),
});

export const createCreditNoteSchema = z.object({
  partyId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  reasonCode: z.enum(['RETURN', 'PRICING_ERROR', 'GOODWILL', 'BAD_DEBT', 'OTHER']),
  reasonText: z.string().trim().min(1).max(1000),
  lines: z.array(creditNoteLineSchema).min(1).max(200),
});

export const allocateCreditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  amountPence: z.number().int().positive(),
});

export const recordPaymentSchema = z.object({
  partyId: z.string().uuid(),
  method: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']),
  reference: z.string().trim().max(200).optional(),
  amountPence: z.number().int().positive(),
  receivedDate: z.string().datetime().optional(),
  // Optional: allocate immediately at creation against one or more invoices.
  allocations: z.array(z.object({
    invoiceId: z.string().uuid(),
    amountPence: z.number().int().positive(),
  })).max(50).optional(),
});

export const allocatePaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountPence: z.number().int().positive(),
});
