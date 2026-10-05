import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fresh module state per test — the cart store keeps module-level variables.
async function loadStore() {
  vi.resetModules();
  return await import('./state.ts');
}

const API_CART = {
  items: [
    {
      id: 11,
      productId: 'ribbed-knit-top',
      name: 'Ribbed Knit Top',
      price: 25.99,
      image: 'https://example.com/top.jpg',
      quantity: 2,
      size: 'M',
      color: 'Cream',
    },
  ],
  count: 2,
  subtotal: 51.98,
  shipping: 9.99,
  tax: 4.16,
  total: 66.13,
  currency: 'USD',
  freeShippingThreshold: 99,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cart store (API mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the cart and adopts the server-computed totals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(API_CART)));
    const store = await loadStore();

    await store.initCart();

    expect(store.getCart()).toHaveLength(1);
    expect(store.getCartCount()).toBe(2);
    expect(store.getCartSubtotal()).toBe(51.98);
    expect(store.getCartTotal()).toBe(66.13);
    expect(store.isOfflineCart()).toBe(false);
  });

  it('adds a line and refreshes from the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(API_CART));
    vi.stubGlobal('fetch', fetchMock);
    const store = await loadStore();

    await store.initCart();
    await store.addToCart({
      id: 'ribbed-knit-top',
      name: 'Ribbed Knit Top',
      price: 25.99,
      image: 'https://example.com/top.jpg',
    });

    const addCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(addCall).toBeTruthy();
    expect(JSON.parse(addCall![1].body as string)).toEqual({
      productId: 'ribbed-knit-top',
      quantity: 1,
      variantId: undefined,
    });
    expect(store.isOfflineCart()).toBe(false);
  });

  it('falls back to localStorage when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const store = await loadStore();

    await store.initCart();
    expect(store.isOfflineCart()).toBe(true);

    await store.addToCart({
      id: 'linen-blend-blazer',
      name: 'Linen Blend Blazer',
      price: 89.99,
      image: 'https://example.com/blazer.jpg',
    });

    expect(store.getCart()).toHaveLength(1);
    expect(store.getCartCount()).toBe(1);
    expect(JSON.parse(localStorage.getItem('fashionhub-cart') ?? '[]')).toHaveLength(1);
  });

  it('merges duplicate lines in offline mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = await loadStore();
    await store.initCart();

    const product = { id: 'a', name: 'A', price: 10, image: '' };
    await store.addToCart(product);
    await store.addToCart(product);

    expect(store.getCart()).toHaveLength(1);
    expect(store.getCart()[0].quantity).toBe(2);
    expect(store.getCartCount()).toBe(2);
  });

  it('keeps variant lines separate in offline mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = await loadStore();
    await store.initCart();

    await store.addToCart({ id: 'a', name: 'A', price: 10, image: '', variantId: 1, size: 'S' });
    await store.addToCart({ id: 'a', name: 'A', price: 10, image: '', variantId: 2, size: 'M' });

    expect(store.getCart()).toHaveLength(2);
  });

  it('re-throws a server rejection instead of silently going offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(API_CART)) // initCart succeeds
        .mockResolvedValueOnce(jsonResponse({ error: 'Out of stock' }, 409))
    );
    const store = await loadStore();
    await store.initCart();

    await expect(
      store.addToCart({ id: 'ribbed-knit-top', name: 'Ribbed Knit Top', price: 25.99, image: '' })
    ).rejects.toThrow();

    expect(store.isOfflineCart()).toBe(false);
  });

  it('decrements to zero by removing the line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = await loadStore();
    await store.initCart();
    await store.addToCart({ id: 'a', name: 'A', price: 10, image: '' });

    await store.updateQuantity(store.getCart()[0].id, -1);

    expect(store.getCart()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('fashionhub-cart') ?? '[]')).toHaveLength(0);
  });

  it('clearCart wipes the local copy too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = await loadStore();
    await store.initCart();
    await store.addToCart({ id: 'a', name: 'A', price: 10, image: '' });

    await store.clearCart();

    expect(store.getCart()).toHaveLength(0);
    expect(store.getCartTotal()).toBe(0);
    expect(JSON.parse(localStorage.getItem('fashionhub-cart') ?? '[]')).toHaveLength(0);
  });

  it('notifies subscribers on every change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = await loadStore();
    const listener = vi.fn();

    store.subscribe(listener);
    await store.initCart();
    await store.addToCart({ id: 'a', name: 'A', price: 10, image: '' });

    expect(listener).toHaveBeenCalled();
    const callsAfterAdd = listener.mock.calls.length;

    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
    await store.addToCart({ id: 'b', name: 'B', price: 5, image: '' });
    expect(listener.mock.calls.length).toBeGreaterThan(callsAfterAdd);
  });

  it('recovers the server cart when the connection returns', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline')) // initCart
      .mockResolvedValueOnce(jsonResponse(API_CART)); // retryConnection
    vi.stubGlobal('fetch', fetchMock);

    const store = await loadStore();
    await store.initCart();
    expect(store.isOfflineCart()).toBe(true);

    const restored = await store.retryConnection();
    expect(restored).toBe(true);
    expect(store.isOfflineCart()).toBe(false);
    expect(store.getCartTotal()).toBe(66.13);
  });
});
