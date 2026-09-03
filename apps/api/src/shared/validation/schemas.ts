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

export const createCustomerSchema = z.object({
  legalName: z.string().trim().min(1).max(300),
  type: z.enum(['COMPANY', 'INDIVIDUAL']).optional(),
  vatNumber: z.string().trim().max(30).optional(),
  paymentTerms: z.number().int().min(0).max(365).optional(),
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
  lines: z.array(invoiceLineSchema).min(1).max(200),
});
