import { api } from '@api/client.ts';
import { loadCart, saveCart } from '@utils/storage.ts';
import { priceItems, type CartTotals } from '@utils/pricing.ts';
import type { CartItem, CartResponse } from '@app-types/cart.ts';

export interface AddToCartInput {
  id: string;
  name: string;
  price: number;
  image: string;
  variantId?: number;
  size?: string;
  color?: string;
}

let items: CartItem[] = [];
let totals: CartTotals = priceItems([]);
let listeners: Array<() => void> = [];
let isLoading = false;
/** True once the API has failed; the cart then lives in localStorage only. */
let useLocalFallback = false;
let localIdCounter = 1;

function normalizeItem(item: CartItem): CartItem {
  return {
    ...item,
    id: Number(item.id),
    price: Number(item.price),
    quantity: Number(item.quantity),
    image: item.image ?? '',
  };
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

function applyApiCart(data: CartResponse): void {
  items = (data.items ?? []).map(normalizeItem);
  totals = {
    count: Number(data.count ?? 0),
    subtotal: Number(data.subtotal ?? 0),
    shipping: Number(data.shipping ?? 0),
    tax: Number(data.tax ?? 0),
    total: Number(data.total ?? 0),
    currency: data.currency ?? 'USD',
    freeShippingThreshold: Number(data.freeShippingThreshold ?? 99),
  };
}

function recomputeLocalTotals(): void {
  totals = priceItems(items);
}

function persistLocalCart(): void {
  saveCart(items);
  recomputeLocalTotals();
}

function nextLocalId(): number {
  const maxId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  localIdCounter = Math.max(localIdCounter, maxId + 1);
  return localIdCounter++;
}

/* --- Selectors ---------------------------------------------------------- */

export function getCart(): CartItem[] {
  return items;
}

export function getTotals(): CartTotals {
  return totals;
}

export function getCartTotal(): number {
  return totals.total;
}

/** Subtotal only — the drawer shows this, checkout shows the full breakdown. */
export function getCartSubtotal(): number {
  return totals.subtotal;
}

export function getCartCount(): number {
  return totals.count;
}

export function isCartLoading(): boolean {
  return isLoading;
}

export function isOfflineCart(): boolean {
  return useLocalFallback;
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((listener) => listener !== fn);
  };
}

/* --- Loading ------------------------------------------------------------- */

async function refresh(): Promise<void> {
  if (useLocalFallback) {
    items = loadCart();
    recomputeLocalTotals();
    notify();
    return;
  }

  try {
    isLoading = true;
    notify();

    applyApiCart(await api.cart.get());
    notify();
  } catch (error) {
    console.warn('Cart API unavailable, using local cart:', error);
    useLocalFallback = true;
    items = loadCart();
    recomputeLocalTotals();
    notify();
  } finally {
    isLoading = false;
    notify();
  }
}

export async function initCart(): Promise<void> {
  await refresh();
}

/** Retry the API after a failure (e.g. when the browser comes back online). */
export async function retryConnection(): Promise<boolean> {
  if (!useLocalFallback) return true;
  try {
    applyApiCart(await api.cart.get());
    useLocalFallback = false;
    notify();
    return true;
  } catch {
    return false;
  }
}

/* --- Mutations ------------------------------------------------------------ */

function addToLocalCart(product: AddToCartInput): void {
  const existing = items.find(
    (item) =>
      item.productId === product.id && (item.variantId ?? undefined) === (product.variantId ?? undefined)
  );

  if (existing) {
    existing.quantity = Number(existing.quantity) + 1;
  } else {
    items.push({
      id: nextLocalId(),
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image,
      quantity: 1,
      variantId: product.variantId,
      size: product.size,
      color: product.color,
    });
  }

  persistLocalCart();
  notify();
}

export async function addToCart(product: AddToCartInput): Promise<void> {
  if (useLocalFallback) {
    addToLocalCart(product);
    return;
  }

  try {
    applyApiCart(
      await api.cart.add({
        productId: product.id,
        variantId: product.variantId,
        quantity: 1,
      })
    );
    notify();
  } catch (error) {
    // A network failure means offline; anything the server rejected (out of
    // stock, validation) must surface to the caller instead.
    if (error instanceof TypeError) {
      console.warn('Add to cart API unreachable, falling back to local cart:', error);
      useLocalFallback = true;
      items = loadCart();
      addToLocalCart(product);
      return;
    }
    throw error;
  }
}

export async function removeFromCart(itemId: number): Promise<void> {
  if (useLocalFallback) {
    items = items.filter((item) => item.id !== itemId);
    persistLocalCart();
    notify();
    return;
  }

  await api.cart.remove(String(itemId));
  await refresh();
}

export async function updateQuantity(itemId: number, delta: number): Promise<void> {
  const item = items.find((cartItem) => cartItem.id === itemId);
  if (!item) return;

  const nextQuantity = Number(item.quantity) + delta;

  if (nextQuantity <= 0) {
    await removeFromCart(itemId);
    return;
  }

  if (useLocalFallback) {
    item.quantity = nextQuantity;
    persistLocalCart();
    notify();
    return;
  }

  await api.cart.update(String(itemId), nextQuantity);
  await refresh();
}

export async function clearCart(): Promise<void> {
  if (!useLocalFallback) {
    try {
      await api.cart.clear();
    } catch (error) {
      // Still clear locally so the UI never shows a stale cart.
      console.warn('Could not clear the server cart:', error);
    }
  }

  items = [];
  saveCart([]);
  recomputeLocalTotals();
  notify();
}

/** Replaces the cart after login so the server-side merge is reflected. */
export function replaceCart(next: CartItem[]): void {
  items = next;
  recomputeLocalTotals();
  notify();
}
