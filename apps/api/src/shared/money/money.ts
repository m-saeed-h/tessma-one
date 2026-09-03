// Money is integer minor units (pence). NEVER floating point — not even
// transiently. AP-07 / FR-SIN-003 / BR-FIN-02 require exact decimal arithmetic;
// a `Number(x) * pct/100` round-trip through IEEE-754 silently mis-rounds a
// double-digit percentage of pennies of lines (e.g. 29%, 35%, 70% all lose a
// penny on real inputs), which is invisible until an accountant checks a total.
//
// Rounding is applied once, at line level, half-up, entirely in BigInt.

// Half-up rounding of the exact rational numerator/denominator, both BigInt,
// numerator may be negative. No float ever enters the calculation.
export function roundDivHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (2n * abs + denominator) / (2n * denominator);
  return negative ? -rounded : rounded;
}

// Percentage helper: exact half-up amount * pct% where pct is a whole percent (0-100).
export function pctOf(amount: bigint, pct: number): bigint {
  return roundDivHalfUp(amount * BigInt(pct), 100n);
}

export interface LineInput {
  quantity: number;
  unitPrice: bigint;   // pence, VAT-exclusive
  discountPct: number;
  vatRatePct: number;
}

export interface LineResult {
  net: bigint;
  vat: bigint;
  total: bigint;
}

export function computeLine(l: LineInput): LineResult {
  const gross = BigInt(l.quantity) * l.unitPrice;
  const discount = pctOf(gross, l.discountPct);
  const net = gross - discount;
  const vat = pctOf(net, l.vatRatePct);
  return { net, vat, total: net + vat };
}

export function penceToGBP(p: bigint): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const s = abs.toString().padStart(3, '0');
  return (neg ? '-' : '') + '£' + s.slice(0, -2) + '.' + s.slice(-2);
}
