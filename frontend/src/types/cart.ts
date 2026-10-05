import type { Product } from './product.ts';

export type { Product };

export interface CartItem {
  /** cart_items.id from the API, or a local counter in offline fallback mode. */
  id: number;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variantId?: number;
  size?: string;
  color?: string;
  sku?: string;
  oldPrice?: number;
  addedAt?: string;
}

/** Shape returned by GET /api/cart (see backend/services/pricing.js). */
export interface CartResponse {
  items: CartItem[];
  count: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  freeShippingThreshold: number;
}

export interface OrderItem {
  id?: number;
  productId?: string;
  variantId?: number | null;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  size?: string;
  color?: string;
}

export interface OrderPayment {
  provider: string | null;
  intentId: string | null;
  clientSecret?: string;
  amount?: number;
  last4: string | null;
  paidAt: string | null;
  failureReason: string | null;
}

/** Shape returned by POST /api/orders and GET /api/orders/:id. */
export interface Order {
  id: string;
  orderId?: string;
  date: string;
  status: string;
  email: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  payment: OrderPayment;
  items: OrderItem[];
}
