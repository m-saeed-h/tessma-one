// FR-LED-002: "a chart of accounts with code, name, type... with a UK
// default template." One source of truth, seeded identically whether a
// tenant is created via /auth/register or via prisma/seed.ts — previously
// duplicated inline in both places, which is exactly the kind of drift
// AP-08 ("one way to do a thing") exists to prevent.
export const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: '1100', name: 'Trade Debtors', type: 'ASSET' },
  { code: '1200', name: 'Bank Current Account', type: 'ASSET' },
  { code: '1300', name: 'VAT Recoverable', type: 'ASSET' },
  { code: '2100', name: 'Trade Creditors', type: 'LIABILITY' },
  { code: '2110', name: 'Employee Expenses Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Output VAT', type: 'LIABILITY' },
  { code: '4000', name: 'Sales', type: 'INCOME' },
  { code: '6000', name: 'General Expenses', type: 'EXPENSE' },
  { code: '7900', name: 'Bad Debt Write-off', type: 'EXPENSE' },
] as const;
