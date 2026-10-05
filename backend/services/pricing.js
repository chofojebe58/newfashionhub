/**
 * Single source of truth for order maths.
 *
 * The checkout UI reads these numbers back from `GET /api/cart` instead of
 * re-implementing them, so the price the customer sees is always the price
 * the server charges.
 */
export const PRICING = {
  currency: 'USD',
  freeShippingThreshold: 99,
  flatShipping: 9.99,
  taxRate: 0.08,
};

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** @param {{price:number, quantity:number}[]} items */
export function priceCart(items, overrides = {}) {
  const rules = { ...PRICING, ...overrides };

  const subtotal = round2(
    items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0)
  );
  const count = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

  const shipping =
    count === 0 || subtotal >= rules.freeShippingThreshold ? 0 : rules.flatShipping;
  const tax = round2(subtotal * rules.taxRate);
  const total = round2(subtotal + shipping + tax);

  return {
    items,
    count,
    subtotal,
    shipping: round2(shipping),
    tax,
    total,
    currency: rules.currency,
    freeShippingThreshold: rules.freeShippingThreshold,
  };
}
