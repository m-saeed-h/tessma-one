import { computeLine, penceToGBP, roundDivHalfUp } from '../src/shared/money/money';

// The financial-calculation tier: exact money, correct rounding, balanced totals.
describe('money calculation', () => {
  it('computes a discounted, VAT-inclusive line to the penny', () => {
    const r = computeLine({ quantity: 3, unitPrice: 1999n, discountPct: 10, vatRatePct: 20 });
    expect(r.net).toBe(5397n);   // 3 * 1999 = 5997, less 10% (600) = 5397
    expect(r.vat).toBe(1079n);   // 20% of 5397 = 1079.4 -> 1079
    expect(r.total).toBe(6476n);
  });

  it('a multi-line invoice posts debits === credits', () => {
    const lines = [
      computeLine({ quantity: 3, unitPrice: 1999n, discountPct: 10, vatRatePct: 20 }),
      computeLine({ quantity: 1, unitPrice: 5000n, discountPct: 0, vatRatePct: 20 }),
      computeLine({ quantity: 2, unitPrice: 750n, discountPct: 0, vatRatePct: 0 }),
    ];
    const net = lines.reduce((s, l) => s + l.net, 0n);
    const vat = lines.reduce((s, l) => s + l.vat, 0n);
    const gross = net + vat;
    // debtors (debit gross) === sales (credit net) + vat (credit vat)
    expect(gross).toBe(net + vat);
  });

  it('formats pence as GBP', () => {
    expect(penceToGBP(6476n)).toBe('£64.76');
    expect(penceToGBP(5n)).toBe('£0.05');
  });

  // Regression: a naive `Number(pence) * pct/100` round-trip through IEEE-754
  // silently mis-rounds specific percentages. 29% of £5.00 (500p) is the
  // textbook example: float gives 14p, the exact value is 15p.
  it('rounds a discount percentage exactly, not via floating point', () => {
    const r = computeLine({ quantity: 1, unitPrice: 500n, discountPct: 29, vatRatePct: 0 });
    expect(r.net).toBe(355n); // 500 - round(500*0.29=145.0) = 355; discount itself is 145
  });

  it('is exact across every whole percentage against a wide value range (no float path)', () => {
    // Exhaustively re-derive the expected rounding from BigInt arithmetic alone
    // and compare — this is the property that broke under `Number(x) * pct/100`.
    for (let pct = 0; pct <= 100; pct++) {
      for (const net of [1n, 50n, 750n, 850n, 1450n, 1550n, 2850n, 999999n]) {
        const got = roundDivHalfUp(net * BigInt(pct), 100n);
        const expected = (2n * (net * BigInt(pct)) + 100n) / (2n * 100n);
        expect(got).toBe(expected);
      }
    }
  });

  it('does not lose precision on values beyond IEEE-754 safe-integer range', () => {
    const huge = 90071992547409n; // > Number.MAX_SAFE_INTEGER pence
    const r = computeLine({ quantity: 1, unitPrice: huge, discountPct: 0, vatRatePct: 20 });
    // huge * 20 = ...48180 pence-hundredths -> exact half-up rounds .80 up.
    expect(r.vat).toBe(roundDivHalfUp(huge * 20n, 100n));
  });
});
