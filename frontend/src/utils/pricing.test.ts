import { describe, expect, it } from 'vitest';
import { PRICING, priceItems, round2 } from './pricing.ts';

describe('priceItems', () => {
  it('returns an empty-cart shape', () => {
    const totals = priceItems([]);
    expect(totals).toMatchObject({ count: 0, subtotal: 0, shipping: 0, tax: 0, total: 0 });
  });

  it('charges flat shipping below the threshold', () => {
    const totals = priceItems([{ price: 25.99, quantity: 2 }]); // 51.98
    expect(totals.subtotal).toBe(51.98);
    expect(totals.shipping).toBe(PRICING.flatShipping);
    expect(totals.tax).toBe(4.16);
    expect(totals.total).toBe(66.13);
  });

  it('gives free shipping at exactly the threshold', () => {
    const totals = priceItems([{ price: 99, quantity: 1 }]);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(round2(99 + 99 * PRICING.taxRate));
  });

  it('counts items, not lines', () => {
    const totals = priceItems([
      { price: 10, quantity: 2 },
      { price: 20, quantity: 3 },
    ]);
    expect(totals.count).toBe(5);
    expect(totals.subtotal).toBe(80);
  });

  it('avoids floating point drift', () => {
    const totals = priceItems([{ price: 0.1, quantity: 3 }]);
    expect(totals.subtotal).toBe(0.3);
  });

  it('accepts rule overrides', () => {
    const totals = priceItems([{ price: 100, quantity: 1 }], { taxRate: 0, flatShipping: 5 });
    expect(totals.tax).toBe(0);
    expect(totals.shipping).toBe(0); // still above the free-shipping threshold
    expect(totals.total).toBe(100);
  });
});

describe('round2', () => {
  it('rounds to cents', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(4.159999)).toBe(4.16);
    expect(round2(0)).toBe(0);
  });
});
