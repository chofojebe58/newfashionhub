import '@styles/main.css';

import { initCart, retryConnection } from '@features/cart/state.ts';
import { initCartUI } from '@features/cart/ui.ts';
import { loadCatalog, getCatalogSource } from '@features/products/catalog.ts';
import {
  initAddToCart,
  renderProductDetail,
  renderProductGrid,
  renderProductGridSkeleton,
} from '@features/products/render.ts';
import { initSearchFilters, refreshCategories } from '@features/products/search-ui.ts';
import { initWishlist } from '@features/user/Wishlist.ts';
import { initNewsletter } from '@features/auth/Newsletter.ts';
import { showToast } from '@components/ui/Toast.ts';
import { bootstrapCommon, onReady } from './bootstrap.ts';
import { loadCategories, renderCategoryTiles } from '@features/content/categories.ts';

const SERVICE_WORKER_URL = '/service-worker.js';

async function bootstrap(): Promise<void> {
  await bootstrapCommon();

  // Cart and catalogue are independent; load them in parallel.
  const gridSelector = document.querySelector('.product-grid') ? '.product-grid' : null;
  if (gridSelector) renderProductGridSkeleton(gridSelector);

  const [, source] = await Promise.all([initCart(), loadCatalog(), loadCategories()]);

  // Collection tiles become real links to real collection pages.
  renderCategoryTiles();

  initCartUI();
  initWishlist();
  initNewsletter();
  initAddToCart();

  // Categories are derived from the loaded catalogue, so this must run after it.
  initSearchFilters();

  if (gridSelector) {
    renderProductGrid(gridSelector);
    refreshCategories();
  }

  if (document.querySelector('#product-detail-root')) {
    renderProductDetail();
  }

  if (source !== 'api') {
    console.info(`Catalogue source: ${source}`);
    if (source === 'defaults') {
      showToast('Showing demo products — the store API is unreachable.');
    }
  }

  registerServiceWorker();
  watchConnectivity();
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

/** When the connection comes back, try to re-adopt the server-side cart. */
function watchConnectivity(): void {
  window.addEventListener('online', () => {
    void retryConnection().then((restored) => {
      if (restored) showToast('Back online — your cart is synced.');
    });
  });
}

onReady(() => void bootstrap());

export { bootstrap, getCatalogSource };
