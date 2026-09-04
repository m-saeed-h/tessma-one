// Canonical permission strings (module.resource.action) and the system roles.
// Permissions are DATA, not code — this registry is the source seeded into each
// tenant. Adding a permission here + to a role is all it takes to grant it.

export const PERMISSIONS = {
  // Core
  USER_MANAGE:      'core.user.manage',
  ROLE_MANAGE:      'core.role.manage',
  SETTINGS_MANAGE:  'core.settings.manage',
  AUDIT_READ:       'core.audit.read',
  // Finance — customers / suppliers / party
  CUSTOMER_READ:    'finance.customer.read',
  CUSTOMER_CREATE:  'finance.customer.create',
  SUPPLIER_READ:    'finance.supplier.read',
  SUPPLIER_CREATE:  'finance.supplier.create',
  // Finance — products
  PRODUCT_READ:     'finance.product.read',
  PRODUCT_CREATE:   'finance.product.create',
  // Finance — quotations
  QUOTATION_READ:   'finance.quotation.read',
  QUOTATION_CREATE: 'finance.quotation.create',
  // Finance — invoicing
  INVOICE_READ:     'finance.invoice.read',
  INVOICE_CREATE:   'finance.invoice.create',
  INVOICE_ISSUE:    'finance.invoice.issue',
  INVOICE_VOID:     'finance.invoice.void',
  // Finance — credit notes
  CREDIT_NOTE_READ:   'finance.creditnote.read',
  CREDIT_NOTE_CREATE: 'finance.creditnote.create',
  // Finance — money movement
  PAYMENT_READ:     'finance.payment.read',
  PAYMENT_RECORD:   'finance.payment.record',
  PAYMENT_RELEASE:  'finance.payment.release',
  // Finance — approvals, vat, reporting
  APPROVAL_ACT:     'finance.approval.act',
  VAT_SUBMIT:       'finance.vat.submit',
  REPORT_READ:      'finance.report.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const ALL = Object.values(P);

// System roles, mapped from the SRS actor table. OWNER gets everything.
export const SYSTEM_ROLES: Record<string, readonly string[]> = {
  OWNER: ALL,
  FINANCE_MANAGER: [
    P.CUSTOMER_READ, P.CUSTOMER_CREATE, P.SUPPLIER_READ, P.SUPPLIER_CREATE,
    P.PRODUCT_READ, P.PRODUCT_CREATE,
    P.QUOTATION_READ, P.QUOTATION_CREATE,
    P.INVOICE_READ, P.INVOICE_CREATE, P.INVOICE_ISSUE, P.INVOICE_VOID,
    P.CREDIT_NOTE_READ, P.CREDIT_NOTE_CREATE,
    P.PAYMENT_READ, P.PAYMENT_RECORD, P.PAYMENT_RELEASE,
    P.APPROVAL_ACT, P.REPORT_READ, P.AUDIT_READ, P.SETTINGS_MANAGE,
  ],
  ACCOUNTANT: [
    P.CUSTOMER_READ, P.SUPPLIER_READ, P.PRODUCT_READ, P.QUOTATION_READ,
    P.INVOICE_READ, P.CREDIT_NOTE_READ,
    P.PAYMENT_READ, P.PAYMENT_RECORD,
    P.VAT_SUBMIT, P.REPORT_READ, P.AUDIT_READ,
  ],
  SALES_USER: [
    P.CUSTOMER_READ, P.CUSTOMER_CREATE, P.PRODUCT_READ,
    P.QUOTATION_READ, P.QUOTATION_CREATE,
    P.INVOICE_READ, P.INVOICE_CREATE,
  ],
  AUDITOR: [
    P.CUSTOMER_READ, P.SUPPLIER_READ, P.PRODUCT_READ, P.QUOTATION_READ,
    P.INVOICE_READ, P.CREDIT_NOTE_READ, P.PAYMENT_READ,
    P.REPORT_READ, P.AUDIT_READ,
  ],
};
