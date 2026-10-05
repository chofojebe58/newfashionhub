import { api } from '@api/client.ts';
import { getProduct } from './catalog.ts';
import { getFilteredProducts, isOnSale, subscribe as subscribeFilters } from './filters.ts';
import { formatCurrency } from '@utils/format.ts';
import { escapeAttr, escapeHtml, safeUrl } from '@utils/escape.ts';
import { addToCart, type AddToCartInput } from '@features/cart/state.ts';
import { openCart } from '@features/cart/ui.ts';
import { showToast } from '@components/ui/Toast.ts';
import { isWishlisted, syncWishlistButtons, toggleWishlist } from '@features/user/Wishlist.ts';
import type { Product, ProductVariant } from '@app-types/product.ts';

/* ================================
   Product Card
================================ */

function discountPercent(product: Product): number | null {
  if (!isOnSale(product) || !product.oldPrice) return null;
  return Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100);
}

export function createProductCard(product: Product): string {
  const name = escapeAttr(product.name);
  const href = `product.html?id=${encodeURIComponent(product.id)}`;
  const discount = discountPercent(product);
  const soldOut = product.stock !== undefined && product.stock <= 0;
  const wished = isWishlisted(product.id);

  return `
    <article
      class="product-card${soldOut ? ' is-sold-out' : ''}"
      data-product-id="${escapeAttr(product.id)}"
      data-name="${name}"
      data-price="${escapeAttr(product.price)}"
      data-image="${safeUrl(product.image, '')}"
    >
      <div class="product-image">
        <a class="product-image-link" href="${href}" aria-label="View ${name}">
          <img
            src="${safeUrl(product.image, '')}"
            alt="${name}"
            width="700"
            height="560"
            loading="lazy"
            decoding="async"
          />
        </a>

        ${discount ? `<span class="badge badge-sale">−${discount}%</span>` : ''}
        ${soldOut ? '<span class="badge badge-sold-out">Sold out</span>' : ''}

        <button
          type="button"
          class="wishlist${wished ? ' active' : ''}"
          data-product-id="${escapeAttr(product.id)}"
          aria-pressed="${wished}"
          aria-label="${wished ? 'Remove' : 'Save'} ${name} ${wished ? 'from' : 'to'} wishlist"
        >${wished ? '♥' : '♡'}</button>
      </div>

      <div class="product-info">
        <a class="product-name-link" href="${href}">
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
        </a>

        <div class="price-line">
          <span class="price-text">${formatCurrency(product.price)}</span>
          ${product.oldPrice ? `<span class="old-price">${formatCurrency(product.oldPrice)}</span>` : ''}
        </div>

        <div class="product-rating">
          <span class="rating" aria-hidden="true">${escapeHtml(product.rating ?? '')}</span>
          <span class="reviews">${escapeHtml(product.reviews ?? '')}</span>
        </div>

        <button
          class="add-to-cart"
          type="button"
          data-product-id="${escapeAttr(product.id)}"
          ${soldOut ? 'disabled' : ''}
        >${soldOut ? 'Sold out' : 'Add to cart'}</button>
      </div>
    </article>
  `;
}

export function createSkeletonCard(): string {
  return `
    <article class="product-card skeleton-card" aria-hidden="true">
      <div class="product-image skeleton-block"></div>
      <div class="product-info">
        <div class="skeleton-line" style="width:70%"></div>
        <div class="skeleton-line" style="width:40%"></div>
        <div class="skeleton-line skeleton-button"></div>
      </div>
    </article>
  `;
}

/* ================================
   Product Grid
================================ */

let currentContainer: Element | null = null;
let currentSelector = '.product-grid';

export function renderProductGridSkeleton(containerSelector = '.product-grid', count = 5): void {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, createSkeletonCard).join('');
}

export function renderProductGrid(containerSelector = currentSelector): void {
  const container = document.querySelector<HTMLElement>(containerSelector);
  if (!container) return;

  currentContainer = container;
  currentSelector = containerSelector;

  let products = getFilteredProducts();

  // The homepage grid is marked `data-featured-only`, so it shows just the
  // products an admin has featured rather than the whole catalogue.
  if (container.dataset.featuredOnly === 'true') {
    products = products.filter((product) => product.featured);
  }

  container.innerHTML = products.length
    ? products.map(createProductCard).join('')
    : `<div class="grid-empty">
         <p>No products match your filters.</p>
         <button type="button" class="btn btn-light" data-clear-filters>Clear all filters</button>
       </div>`;

  bindCardInteractions(container);
}

/* ================================
   Event Delegation
================================ */

let delegated = false;

function ensureDelegation(): void {
  if (delegated) return;
  delegated = true;
  document.addEventListener('click', onDocumentClick);
}

function bindCardInteractions(container: Element): void {
  ensureDelegation();
  // Individual listeners are unnecessary — the document delegate handles both
  // `.add-to-cart` and `.wishlist`, including on cards rendered later.
  container.querySelectorAll<HTMLElement>('[data-bound]').forEach((el) => {
    el.removeAttribute('data-bound');
  });
}

function onDocumentClick(event: Event): void {
  const target = event.target as Element | null;
  if (!target) return;

  if (target.closest('[data-clear-filters]')) {
    document.dispatchEvent(new CustomEvent('fashionhub:clear-filters'));
    return;
  }

  const addButton = target.closest<HTMLButtonElement>('.add-to-cart');
  if (addButton) {
    void handleAddToCart(addButton);
    return;
  }

  const wishlistButton = target.closest<HTMLButtonElement>('.wishlist');
  if (wishlistButton) {
    handleWishlistClick(wishlistButton);
  }
}

/** Bind delegation once on page load so static HTML buttons work too. */
export function initAddToCart(): void {
  ensureDelegation();
}

/* ================================
   Add To Cart
================================ */

async function handleAddToCart(button: HTMLButtonElement): Promise<void> {
  if (button.disabled || button.dataset.busy === 'true') return;

  const source =
    button.closest<HTMLElement>('.product-card') ??
    button.closest<HTMLElement>('.product-detail');

  if (!source) {
    console.error('Could not find a product container for this button');
    showToast('Could not add that product to your cart');
    return;
  }

  const productId = source.dataset.productId ?? source.dataset.id;
  const name = source.dataset.name;
  const price = Number(source.dataset.price);
  const image = source.dataset.image ?? '';

  if (!productId) return showToast('Product ID is missing');
  if (!name) return showToast('Product name is missing');
  if (!Number.isFinite(price) || price <= 0) return showToast('Invalid product price');

  button.dataset.busy = 'true';
  button.disabled = true;
  const originalText = button.textContent ?? 'Add to cart';
  button.textContent = 'Adding…';

  const input: AddToCartInput = { id: productId, name, price, image };

  try {
    await addToCart(input);
    showToast(`${name} added to cart`);
    flashAdded(button);
    openCart();
  } catch (error) {
    console.error('Add to cart failed:', error);
    button.disabled = false;
    button.textContent = originalText;
    showToast(errorMessage(error, 'Could not add product to cart'));
  } finally {
    delete button.dataset.busy;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || fallback;
}

function flashAdded(button: HTMLButtonElement | null): void {
  if (!button) return;
  button.textContent = 'Added ✓';
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = 'Add to cart';
    button.disabled = false;
  }, 1200);
}

/* ================================
   Wishlist
================================ */

function handleWishlistClick(button: HTMLButtonElement): void {
  const productId = button.dataset.productId;
  if (!productId) return;

  const active = toggleWishlist(productId);
  button.classList.toggle('active', active);
  button.textContent = active ? '♥' : '♡';
  button.setAttribute('aria-pressed', String(active));

  const label = button.getAttribute('aria-label') ?? '';
  button.setAttribute(
    'aria-label',
    label.replace(active ? /^Save\s/i : /^Remove\s/i, active ? 'Remove ' : 'Save ')
  );
}

/* ================================
   Filter Subscription
================================ */

subscribeFilters(() => {
  if (!currentContainer) return;
  renderProductGrid(currentSelector);
});

/* ================================
   Product Detail
================================ */

export function renderProductDetail(rootSelector = '#product-detail-root'): void {
  const root = document.querySelector<HTMLElement>(rootSelector);
  if (!root) return;

  const productId = new URLSearchParams(window.location.search).get('id') ?? 'linen-blend-blazer';
  const product = getProduct(productId);

  if (!product) {
    root.innerHTML = `
      <div class="product-not-found">
        <h1>We couldn't find that piece</h1>
        <p>The product you're looking for is no longer available.</p>
        <a class="btn btn-primary" href="shop.html">Back to the shop</a>
      </div>`;
    document.title = 'FashionHub | Product not found';
    return;
  }

  document.title = `FashionHub | ${product.name}`;

  root.dataset.id = product.id;
  root.dataset.name = product.name;
  root.dataset.price = String(product.price);
  root.dataset.image = product.image;

  const name = escapeHtml(product.name);
  const soldOut = product.stock !== undefined && product.stock <= 0;

  root.innerHTML = `
    <div class="product-detail-image">
      <img src="${safeUrl(product.image, '')}" alt="${escapeAttr(product.name)}" />
      ${soldOut ? '<span class="badge badge-sold-out">Sold out</span>' : ''}
    </div>

    <div class="product-detail-content">
      <p class="product-detail-breadcrumb">
        <a href="shop.html">Shop</a> /
        ${product.category ? `<a href="shop.html?category=${encodeURIComponent(product.category)}">${escapeHtml(product.category)}</a> / ` : ''}
        ${name}
      </p>

      <h1>${name}</h1>

      <div class="product-detail-price">
        <strong>${formatCurrency(product.price)}</strong>
        ${product.oldPrice ? `<span>${formatCurrency(product.oldPrice)}</span>` : ''}
      </div>

      <div class="product-detail-meta">
        <span aria-hidden="true">${escapeHtml(product.rating ?? '')}</span>
        <span>${escapeHtml(product.reviews ?? '')}</span>
        ${
          product.stock !== undefined
            ? `<span class="stock-note${soldOut ? ' out' : ''}">${
                soldOut ? 'Out of stock' : `${product.stock} in stock`
              }</span>`
            : ''
        }
      </div>

      <p class="product-detail-description">${escapeHtml(product.description)}</p>

      <div class="product-detail-options">
        <fieldset class="option-group">
          <legend>Size</legend>
          <div class="size-options" id="size-options"></div>
        </fieldset>
        <fieldset class="option-group">
          <legend>Colour</legend>
          <div class="color-options" id="color-options"></div>
        </fieldset>
      </div>

      <div class="product-detail-actions">
        <button class="add-to-cart" type="button" ${soldOut ? '' : 'disabled'}>
          ${soldOut ? 'Sold out' : 'Loading…'}
        </button>
        <a class="secondary-btn" href="shop.html">Continue shopping</a>
      </div>

      <ul class="product-detail-list">
        ${(product.features ?? []).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>
    </div>
  `;

  if (soldOut) return;

  void loadVariantOptions(root, product);
}

interface VariantOptionState {
  sizes: string[];
  colors: string[];
  selectedSize: string | null;
  selectedColor: string | null;
  selectedVariantId: number | null;
}

async function loadVariantOptions(root: HTMLElement, product: Product): Promise<void> {
  const addButton = root.querySelector<HTMLButtonElement>('.add-to-cart');
  const sizeOptions = root.querySelector<HTMLElement>('#size-options');
  const colorOptions = root.querySelector<HTMLElement>('#color-options');

  let variants: ProductVariant[] = [];
  try {
    variants = await api.products.variants(product.id);
    if (!Array.isArray(variants)) variants = [];
  } catch (error) {
    console.error('Failed to load variants:', error);
  }

  const sizes = uniqueValues(variants.map((v) => v.size));
  const colors = uniqueValues(variants.map((v) => v.color));

  const state: VariantOptionState = {
    sizes,
    colors,
    selectedSize: null,
    selectedColor: null,
    selectedVariantId: null,
  };

  function renderOptions(): void {
    if (sizeOptions) {
      sizeOptions.innerHTML = state.sizes
        .map((size) => optionButton('size-btn', size, state.selectedSize, variants))
        .join('');
    }
    if (colorOptions) {
      colorOptions.innerHTML = state.colors
        .map((color) => optionButton('color-btn', color, state.selectedColor, variants))
        .join('');
    }

    const requiresSize = state.sizes.length > 0;
    const requiresColor = state.colors.length > 0;

    state.selectedVariantId =
      (!requiresSize || state.selectedSize) && (!requiresColor || state.selectedColor)
        ? findVariant(variants, state)?.id ?? null
        : null;

    if (!addButton) return;

    if (!requiresSize && !requiresColor) {
      addButton.disabled = false;
      addButton.textContent = 'Add to cart';
    } else if (state.selectedVariantId !== null) {
      const variant = variants.find((v) => v.id === state.selectedVariantId);
      const stock = Number(variant?.stock ?? 0);
      addButton.disabled = stock <= 0;
      addButton.textContent = stock <= 0 ? 'Sold out' : 'Add to cart';
    } else {
      addButton.disabled = true;
      addButton.textContent = 'Select options first';
    }
  }

  sizeOptions?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('.size-btn');
    if (!button) return;
    state.selectedSize = button.dataset.value ?? null;
    renderOptions();
  });

  colorOptions?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('.color-btn');
    if (!button) return;
    state.selectedColor = button.dataset.value ?? null;
    renderOptions();
  });

  renderOptions();

  addButton?.addEventListener('click', async () => {
    if (!addButton || addButton.disabled) return;

    if ((sizes.length > 0 || colors.length > 0) && state.selectedVariantId === null) {
      showToast('Please select your options');
      return;
    }

    const id = root.dataset.id;
    const name = root.dataset.name;
    const price = Number(root.dataset.price);
    const image = root.dataset.image ?? '';

    if (!id || !name || !Number.isFinite(price) || price <= 0) {
      showToast('Invalid product information');
      return;
    }

    const variant = variants.find((v) => v.id === state.selectedVariantId);

    addButton.disabled = true;
    addButton.textContent = 'Adding…';

    try {
      await addToCart({
        id,
        name,
        price,
        image,
        variantId: state.selectedVariantId ?? undefined,
        size: variant?.size ?? undefined,
        color: variant?.color ?? undefined,
      });
      showToast(`${name} added to cart`);
      flashAdded(addButton);
      openCart();
    } catch (error) {
      console.error('Failed to add product to cart:', error);
      addButton.disabled = false;
      addButton.textContent = 'Add to cart';
      showToast(errorMessage(error, 'Could not add product to cart'));
    }
  });
}

function optionButton(
  className: string,
  value: string,
  selected: string | null,
  variants: ProductVariant[]
): string {
  const soldOut = !variants.some(
    (v) => (v.size === value || v.color === value) && Number(v.stock) > 0
  );
  return `
    <button
      type="button"
      class="option-btn ${className}${selected === value ? ' selected' : ''}${soldOut ? ' sold-out' : ''}"
      data-value="${escapeAttr(value)}"
      ${soldOut ? 'disabled aria-disabled="true"' : ''}
      title="${soldOut ? 'Sold out' : escapeAttr(value)}"
    >${escapeHtml(value)}</button>
  `;
}

function findVariant(variants: ProductVariant[], state: VariantOptionState): ProductVariant | undefined {
  return variants.find((v) => {
    const sizeOk = state.sizes.length === 0 || v.size === state.selectedSize;
    const colorOk = state.colors.length === 0 || v.color === state.selectedColor;
    return sizeOk && colorOk;
  });
}

function uniqueValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export { syncWishlistButtons };
