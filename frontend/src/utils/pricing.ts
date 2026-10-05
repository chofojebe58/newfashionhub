/**
 * Mirror of backend/services/pricing.js.
 *
 * Only used when the API is unreachable and the cart falls back to
 * localStorage — in the normal path the server's numbers are authoritative and
 * are read straight off `GET /api/cart`.
 */
export interface PricingRules {
  currency: string;
  freeShippingThreshold: number;
  flatShipping: number;
  taxRate: number;
}

export const PRICING: PricingRules = {
  currency: 'USD',
  freeShippingThreshold: 99,
  flatShipping: 9.99,
  taxRate: 0.08,
};

export interface CartTotals {
  count: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  freeShippingThreshold: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function priceItems(
  items: Array<{ price: number; quantity: number }>,
  rules: Partial<PricingRules> = {}
): CartTotals {
  const cfg = { ...PRICING, ...rules };

  const subtotal = round2(
    items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0)
  );
  const count = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const shipping =
    count === 0 || subtotal >= cfg.freeShippingThreshold ? 0 : cfg.flatShipping;
  const tax = round2(subtotal * cfg.taxRate);

  return {
    count,
    subtotal,
    shipping: round2(shipping),
    tax,
    total: round2(subtotal + shipping + tax),
    currency: cfg.currency,
    freeShippingThreshold: cfg.freeShippingThreshold,
  };
}
