import {
  getCart,
  getCartCount,
  getTotals,
  isOfflineCart,
  removeFromCart,
  subscribe,
  updateQuantity,
} from './state.ts';
import { formatCurrency } from '@utils/format.ts';
import { escapeAttr, escapeHtml, formatList, safeUrl } from '@utils/escape.ts';
import type { CartItem } from '@app-types/cart.ts';

let cartPanel: HTMLElement | null = null;
let cartToggle: HTMLElement | null = null;
let closeCartButton: HTMLElement | null = null;
let cartCountEl: HTMLElement | null = null;
let cartTotalEl: HTMLElement | null = null;
let cartItemsList: HTMLElement | null = null;
let releaseFocusTrap: (() => void) | null = null;
let lastFocusedElement: HTMLElement | null = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isOpen(): boolean {
  return Boolean(cartPanel?.classList.contains('open'));
}

export function initCartUI(): void {
  cartPanel = document.querySelector<HTMLElement>('.cart-panel');
  cartToggle = document.querySelector<HTMLElement>('.cart-toggle');
  closeCartButton = document.querySelector<HTMLElement>('.close-cart');
  cartCountEl = document.querySelector<HTMLElement>('.cart-count');
  cartTotalEl = document.querySelector<HTMLElement>('.cart-total');
  cartItemsList = document.querySelector<HTMLElement>('.cart-items');

  if (!cartPanel || !cartToggle) return;

  cartToggle.addEventListener('click', toggleCart);
  closeCartButton?.addEventListener('click', () => closeCart());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeCart();
  });

  // Clicking outside closes the drawer — but only when it is actually open,
  // and without stealing focus from whatever the user clicked.
  document.addEventListener('click', (event) => {
    if (!isOpen()) return;

    const target = event.target as Element | null;
    if (target?.closest('.cart-panel') || target?.closest('.cart-toggle')) return;

    closeCart({ restoreFocus: false });
  });

  document.querySelectorAll<HTMLElement>('.checkout-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = 'checkout.html';
    });
  });

  subscribe(renderCartUI);
  renderCartUI();
}

function toggleCart(): void {
  if (isOpen()) closeCart();
  else openCart();
}

export function openCart(): void {
  if (!cartPanel || isOpen()) return;

  lastFocusedElement = document.activeElement as HTMLElement | null;

  cartPanel.classList.add('open');
  cartPanel.setAttribute('aria-hidden', 'false');
  cartToggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('cart-open');

  closeCartButton?.focus();
  enableFocusTrap();
}

export function closeCart(options: { restoreFocus?: boolean } = {}): void {
  const { restoreFocus = true } = options;
  if (!cartPanel || !isOpen()) return;

  cartPanel.classList.remove('open');
  cartPanel.setAttribute('aria-hidden', 'true');
  cartToggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cart-open');

  disableFocusTrap();

  if (restoreFocus) {
    (lastFocusedElement ?? cartToggle)?.focus();
  }
  lastFocusedElement = null;
}

function cartRow(item: CartItem): string {
  const name = escapeAttr(item.name);
  const variant = formatList([item.size, item.color]);

  return `
    <li class="cart-item" data-id="${escapeAttr(item.id)}">
      <img src="${safeUrl(item.image, '')}" alt="${name}" loading="lazy" decoding="async" />
      <div class="cart-item-content">
        <strong>${escapeHtml(item.name)}</strong>
        ${variant ? `<span class="cart-item-variant">${escapeHtml(variant)}</span>` : ''}
        <span class="cart-item-price">${formatCurrency(item.price)} each</span>
        <div class="cart-item-actions">
          <div class="qty-control" role="group" aria-label="Quantity controls for ${name}">
            <button class="qty-btn qty-decrease" type="button" data-id="${escapeAttr(item.id)}"
              aria-label="Decrease quantity for ${name}">&minus;</button>
            <span class="qty-value" aria-live="polite">${escapeHtml(item.quantity)}</span>
            <button class="qty-btn qty-increase" type="button" data-id="${escapeAttr(item.id)}"
              aria-label="Increase quantity for ${name}">+</button>
          </div>
          <button class="remove-item" type="button" data-id="${escapeAttr(item.id)}"
            aria-label="Remove ${name} from cart">Remove</button>
        </div>
      </div>
    </li>
  `;
}

export function renderCartUI(): void {
  const cart = getCart();
  const { subtotal, freeShippingThreshold } = getTotals();

  if (cartCountEl) {
    const count = getCartCount();
    cartCountEl.textContent = String(count);
    cartCountEl.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in cart`);
    cartToggle?.setAttribute('aria-label', `Open cart, ${count} item${count === 1 ? '' : 's'}`);
  }

  if (cartTotalEl) cartTotalEl.textContent = formatCurrency(subtotal);

  if (!cartItemsList) return;

  const offlineNote = isOfflineCart()
    ? '<li class="cart-notice">You appear to be offline — this cart is saved on this device only.</li>'
    : '';

  if (!cart.length) {
    cartItemsList.innerHTML = `${offlineNote}<li class="empty-cart">Your cart is empty.</li>`;
    return;
  }

  const remaining = freeShippingThreshold - subtotal;
  const shippingNote =
    remaining > 0
      ? `<li class="cart-notice">Add ${formatCurrency(remaining)} more for free shipping.</li>`
      : '<li class="cart-notice success">You’ve unlocked free shipping.</li>';

  cartItemsList.innerHTML = offlineNote + shippingNote + cart.map(cartRow).join('');

  bindCartActions();
}

function bindCartActions(): void {
  cartItemsList?.querySelectorAll<HTMLButtonElement>('.qty-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.id);
      if (!Number.isFinite(id)) return;
      const delta = button.classList.contains('qty-increase') ? 1 : -1;
      void updateQuantity(id, delta).catch((error) => console.error('Quantity update failed:', error));
    });
  });

  cartItemsList?.querySelectorAll<HTMLButtonElement>('.remove-item').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.id);
      if (!Number.isFinite(id)) return;
      void removeFromCart(id).catch((error) => console.error('Remove failed:', error));
    });
  });
}

function trapFocusIn(container: HTMLElement): () => void {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!focusable.length) return () => {};

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}

function enableFocusTrap(): void {
  if (!cartPanel) return;
  releaseFocusTrap = trapFocusIn(cartPanel);
}

function disableFocusTrap(): void {
  if (typeof releaseFocusTrap === 'function') releaseFocusTrap();
  releaseFocusTrap = null;
}
