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
  INVOICE_SEND:     'finance.invoice.send',
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
  // Finance — accounting periods (FR-SET-011/012)
  PERIOD_READ:      'finance.period.read',
  PERIOD_MANAGE:    'finance.period.manage',
  PERIOD_REOPEN:    'finance.period.reopen',
  // Finance — manual journals
  JOURNAL_READ:     'finance.journal.read',
  JOURNAL_POST:     'finance.journal.post',
  // Finance — numbering scheme configuration
  NUMBERING_MANAGE: 'finance.numbering.manage',
  // Finance — expenses
  EXPENSE_READ:     'finance.expense.read',
  EXPENSE_SUBMIT:   'finance.expense.submit',
  EXPENSE_APPROVE:  'finance.expense.approve',
  // Finance — accounts payable
  PURCHASE_INVOICE_READ:   'finance.purchaseinvoice.read',
  PURCHASE_INVOICE_CREATE: 'finance.purchaseinvoice.create',
  PURCHASE_INVOICE_APPROVE:'finance.purchaseinvoice.approve',
  SUPPLIER_PAYMENT_READ:   'finance.supplierpayment.read',
  SUPPLIER_PAYMENT_RECORD: 'finance.supplierpayment.record',
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
    P.INVOICE_READ, P.INVOICE_CREATE, P.INVOICE_ISSUE, P.INVOICE_VOID, P.INVOICE_SEND,
    P.CREDIT_NOTE_READ, P.CREDIT_NOTE_CREATE,
    P.PAYMENT_READ, P.PAYMENT_RECORD, P.PAYMENT_RELEASE,
    P.APPROVAL_ACT, P.REPORT_READ, P.AUDIT_READ, P.SETTINGS_MANAGE,
    P.PERIOD_READ, P.PERIOD_MANAGE, P.PERIOD_REOPEN, P.JOURNAL_READ, P.JOURNAL_POST,
    P.NUMBERING_MANAGE, P.EXPENSE_READ, P.EXPENSE_SUBMIT, P.EXPENSE_APPROVE,
    P.PURCHASE_INVOICE_READ, P.PURCHASE_INVOICE_CREATE, P.PURCHASE_INVOICE_APPROVE,
    P.SUPPLIER_PAYMENT_READ, P.SUPPLIER_PAYMENT_RECORD,
  ],
  ACCOUNTANT: [
    P.CUSTOMER_READ, P.SUPPLIER_READ, P.PRODUCT_READ, P.QUOTATION_READ,
    P.INVOICE_READ, P.CREDIT_NOTE_READ,
    P.PAYMENT_READ, P.PAYMENT_RECORD,
    P.VAT_SUBMIT, P.REPORT_READ, P.AUDIT_READ,
    P.PERIOD_READ, P.PERIOD_MANAGE, P.JOURNAL_READ, P.JOURNAL_POST,
    P.EXPENSE_READ, P.EXPENSE_APPROVE,
    P.PURCHASE_INVOICE_READ, P.PURCHASE_INVOICE_CREATE, P.PURCHASE_INVOICE_APPROVE,
    P.SUPPLIER_PAYMENT_READ, P.SUPPLIER_PAYMENT_RECORD,
  ],
  SALES_USER: [
    P.CUSTOMER_READ, P.CUSTOMER_CREATE, P.PRODUCT_READ,
    P.QUOTATION_READ, P.QUOTATION_CREATE,
    P.INVOICE_READ, P.INVOICE_CREATE, P.INVOICE_SEND,
    P.EXPENSE_READ, P.EXPENSE_SUBMIT,
  ],
  // FR-EXP: "Employee — Submits expenses. Own expenses and claims only" per
  // the Finance spec's actor table — a role distinct from Sales/Accounts,
  // scoped to nothing but its own claims (enforced in expenses.service.ts,
  // not by this permission list alone).
  EMPLOYEE: [
    P.EXPENSE_READ, P.EXPENSE_SUBMIT,
  ],
  AUDITOR: [
    P.CUSTOMER_READ, P.SUPPLIER_READ, P.PRODUCT_READ, P.QUOTATION_READ,
    P.INVOICE_READ, P.CREDIT_NOTE_READ, P.PAYMENT_READ,
    P.REPORT_READ, P.AUDIT_READ,
    P.PERIOD_READ, P.JOURNAL_READ, P.EXPENSE_READ, P.PURCHASE_INVOICE_READ, P.SUPPLIER_PAYMENT_READ,
  ],
};
