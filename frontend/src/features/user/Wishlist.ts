import { api } from '@api/client.ts';
import { loadWishlist, saveWishlist, getAuthToken } from '@utils/storage.ts';

/**
 * Wishlist.
 *
 * Signed out: a browser-local set of product ids.
 * Signed in: the server is the source of truth (`/api/wishlist`), with
 * localStorage kept as a mirror so the hearts render instantly on first paint.
 *
 * `syncWishlistToServer()` is called right after login and pushes the local
 * list up so nothing the user hearted as a guest is lost.
 */
const STORAGE_KEY = 'fashionhub-wishlist';

let ids: Set<string> = new Set(loadWishlist());
let listeners: Array<(ids: string[]) => void> = [];
let syncing: Promise<void> | null = null;

const signedIn = (): boolean => Boolean(getAuthToken());

function persist(): void {
  saveWishlist([...ids]);
}

function notify(): void {
  const snapshot = [...ids];
  listeners.forEach((fn) => fn(snapshot));
}

function setIds(next: Iterable<string>): void {
  ids = new Set(next);
  persist();
  notify();
}

export function getWishlist(): string[] {
  return [...ids];
}

export function isWishlisted(productId: string): boolean {
  return ids.has(productId);
}

/**
 * Adds or removes the id and reports the new state.
 *
 * The local set is updated immediately (optimistic) and the server call runs in
 * the background; a failure is logged and retried on the next login.
 */
export function toggleWishlist(productId: string): boolean {
  if (!productId) return false;

  const willAdd = !ids.has(productId);
  if (willAdd) ids.add(productId);
  else ids.delete(productId);

  persist();
  notify();

  if (signedIn()) {
    const call = willAdd
      ? api.wishlist.add(productId)
      : api.wishlist.remove(productId);

    call
      .then((res) => setIds(res.items.map((i) => i.productId)))
      .catch((error) => console.warn('Could not sync the wishlist:', error));
  }

  return willAdd;
}

export function clearWishlist(): void {
  setIds([]);
  if (signedIn()) {
    api.wishlist.replace([]).catch((error) => console.warn('Could not clear the wishlist:', error));
  }
}

export function subscribeWishlist(fn: (ids: string[]) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** Pulls the account's wishlist down from the server. */
export async function loadWishlistFromServer(): Promise<void> {
  if (!signedIn()) return;
  try {
    const { items } = await api.wishlist.list();
    setIds(items.map((i) => i.productId));
  } catch (error) {
    console.warn('Could not load the wishlist:', error);
  }
}

/**
 * Pushes the local list up after signing in, keeping the union of both so a
 * heart saved on another device is not clobbered.
 */
export function syncWishlistToServer(): Promise<void> {
  if (!signedIn()) return Promise.resolve();
  if (syncing) return syncing;

  syncing = (async () => {
    try {
      const { items } = await api.wishlist.list();
      const union = new Set([...items.map((i) => i.productId), ...ids]);
      const { items: saved } = await api.wishlist.replace([...union]);
      setIds(saved.map((i) => i.productId));
    } catch (error) {
      console.warn('Could not sync the wishlist to the account:', error);
    } finally {
      syncing = null;
    }
  })();

  return syncing;
}

/** Reflects the stored set onto every heart button currently in the DOM. */
export function syncWishlistButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('.wishlist[data-product-id]').forEach((button) => {
    const active = isWishlisted(button.dataset.productId ?? '');
    button.classList.toggle('active', active);
    button.textContent = active ? '\u2665' : '\u2661';
    button.setAttribute('aria-pressed', String(active));
  });
}

/**
 * Sets up persistence-driven UI sync.
 *
 * Click handling lives in a single document-level delegate
 * (features/products/render.ts) so dynamically rendered cards work too —
 * binding per-button listeners here as well would double-toggle.
 */
export function initWishlist(): void {
  syncWishlistButtons();

  if (signedIn()) void loadWishlistFromServer();

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    ids = new Set(loadWishlist());
    notify();
  });

  subscribeWishlist(() => syncWishlistButtons());
}
