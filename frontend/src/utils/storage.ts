import type { CartItem, Order } from '@app-types/cart.ts';
import type { Product } from '@app-types/product.ts';

const STORAGE_KEYS = {
  cart: 'fashionhub-cart',
  orders: 'fashionhub-orders',
  products: 'fashionhub-products',
  wishlist: 'fashionhub-wishlist',
  session: 'session_id',
  token: 'auth_token',
  user: 'auth_user',
  subscriberEmail: 'fashionhub-subscriber-email',
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled (private mode) — degrade silently.
  }
}

/* --- Offline cart -------------------------------------------------------- */

export function loadCart(): CartItem[] {
  const parsed = readJson<unknown>(STORAGE_KEYS.cart, []);
  return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
}

export function saveCart(cart: CartItem[]): void {
  writeJson(STORAGE_KEYS.cart, cart);
}

/* --- Order history (local mirror of what this browser has placed) --------- */

export function loadOrders(): Order[] {
  const parsed = readJson<unknown>(STORAGE_KEYS.orders, []);
  return Array.isArray(parsed) ? (parsed as Order[]) : [];
}

export function saveOrder(order: Order): void {
  const existing = loadOrders().filter((o) => o?.id !== order.id);
  existing.unshift(order);
  // Cap the mirror so localStorage cannot grow without bound.
  writeJson(STORAGE_KEYS.orders, existing.slice(0, 50));
}

export function getOrder(id: string): Order | undefined {
  return loadOrders().find((o) => o?.id === id);
}

/* --- Product catalogue cache --------------------------------------------- */

export function loadProducts(): Record<string, Product> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.products);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Product[] | Record<string, Product>;

    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, Product>>((acc, p) => {
        if (p?.id) acc[p.id] = p;
        return acc;
      }, {});
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProducts(products: Product[] | Record<string, Product>): void {
  writeJson(STORAGE_KEYS.products, Array.isArray(products) ? products : Object.values(products));
}

/* --- Wishlist ------------------------------------------------------------- */

export function loadWishlist(): string[] {
  const parsed = readJson<unknown>(STORAGE_KEYS.wishlist, []);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}

export function saveWishlist(productIds: string[]): void {
  writeJson(STORAGE_KEYS.wishlist, productIds);
}

/* --- Session / auth -------------------------------------------------------- */

export function getSessionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.session);
  } catch {
    return null;
  }
}

export function setSessionId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.session, id);
  } catch {
    /* ignore */
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.token);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEYS.token, token);
    else localStorage.removeItem(STORAGE_KEYS.token);
  } catch {
    /* ignore */
  }
}

/* --- Newsletter ------------------------------------------------------------ */

export function getSubscriberEmail(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.subscriberEmail) ?? '';
  } catch {
    return '';
  }
}

export function setSubscriberEmail(email: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.subscriberEmail, email);
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEYS };
