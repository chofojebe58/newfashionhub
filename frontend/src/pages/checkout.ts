import '@styles/main.css';

import { api, ApiError, type StoreConfig } from '@api/client.ts';
import { bootstrapCommon, onReady } from '../bootstrap.ts';
import { showToast } from '@components/ui/Toast.ts';
import { formatCurrency } from '@utils/format.ts';
import { escapeAttr, escapeHtml, formatList, safeUrl } from '@utils/escape.ts';
import { getSubscriberEmail, saveOrder } from '@utils/storage.ts';
import { getUser } from '@features/auth/session.ts';
import type { CartResponse, Order } from '@app-types/cart.ts';

/**
 * Checkout page.
 *
 * Money maths is *not* duplicated here — the summary is rendered straight from
 * `GET /api/cart`, which is the same computation the server uses when it
 * creates the order (backend/services/pricing.js).
 */

const form = document.querySelector<HTMLFormElement>('.checkout-form');
const summaryItems = document.querySelector<HTMLElement>('#summary-items');
const summarySubtotal = document.querySelector<HTMLElement>('#summary-subtotal');
const summaryShipping = document.querySelector<HTMLElement>('#summary-shipping');
const summaryTax = document.querySelector<HTMLElement>('#summary-tax');
const summaryTotal = document.querySelector<HTMLElement>('#summary-total');
const submitBtn = document.querySelector<HTMLButtonElement>('.checkout-submit');
const freeShippingNote = document.querySelector<HTMLElement>('#free-shipping-note');

/**
 * An order is created *before* it is paid, so a declined card must not create a
 * second order. The pending id lives in sessionStorage until payment succeeds.
 */
const PENDING_ORDER_KEY = 'fashionhub-pending-order';

let cart: CartResponse | null = null;
let storeConfig: StoreConfig | null = null;

function getPendingOrderId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_ORDER_KEY);
  } catch {
    return null;
  }
}

function setPendingOrderId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(PENDING_ORDER_KEY, id);
    else sessionStorage.removeItem(PENDING_ORDER_KEY);
  } catch {
    /* ignore */
  }
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement | null {
  return form?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`) ?? null;
}

/* --- Summary ------------------------------------------------------------- */

async function renderSummary(): Promise<void> {
  if (!summaryItems) return;

  try {
    cart = await api.cart.get();
  } catch (error) {
    console.error('Failed to load cart:', error);
    summaryItems.innerHTML =
      '<div class="empty-cart">We couldn’t load your cart. Please go back and try again.</div>';
    setTotals(null);
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (!cart.items.length) {
    summaryItems.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty.</p>
        <a class="btn btn-light" href="shop.html">Continue shopping</a>
      </div>`;
    setTotals(cart);
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  summaryItems.innerHTML = cart.items
    .map((item) => {
      const variant = formatList([item.size, item.color]);
      const name = escapeAttr(item.name);
      return `
      <div class="summary-item">
        <img class="summary-thumb" src="${safeUrl(item.image, '')}" alt="${name}" loading="lazy" decoding="async" />
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          ${variant ? `<span>${escapeHtml(variant)}</span>` : ''}
          <span>${escapeHtml(item.quantity)} item${item.quantity === 1 ? '' : 's'}</span>
        </div>
        <span>${formatCurrency(Number(item.price) * Number(item.quantity))}</span>
      </div>`;
    })
    .join('');

  setTotals(cart);
  if (submitBtn) submitBtn.disabled = false;
}

function setTotals(data: CartResponse | null): void {
  if (summarySubtotal) summarySubtotal.textContent = formatCurrency(data?.subtotal ?? 0);
  if (summaryShipping) {
    const shipping = data?.shipping ?? 0;
    summaryShipping.textContent = shipping === 0 ? 'Free' : formatCurrency(shipping);
  }
  if (summaryTax) summaryTax.textContent = formatCurrency(data?.tax ?? 0);
  if (summaryTotal) summaryTotal.textContent = formatCurrency(data?.total ?? 0);

  if (freeShippingNote && data && data.count > 0) {
    const remaining = data.freeShippingThreshold - data.subtotal;
    freeShippingNote.textContent =
      remaining > 0
        ? `Add ${formatCurrency(remaining)} more to qualify for free shipping.`
        : 'Free shipping applied.';
    freeShippingNote.hidden = false;
  }
}

/* --- Validation ---------------------------------------------------------- */

const VALIDATORS: Record<string, (value: string) => string | null> = {
  firstName: (v) => (v ? null : 'Please enter your first name.'),
  lastName: (v) => (v ? null : 'Please enter your last name.'),
  email: (v) =>
    !v
      ? 'Please enter your email address.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
        ? null
        : 'That doesn’t look like a valid email address.',
  address: (v) => (v ? null : 'Please enter a shipping address.'),
  city: (v) => (v ? null : 'Please enter a city.'),
  postalCode: (v) => (v ? null : 'Please enter a postal code.'),
  cardname: (v) => (v ? null : 'Please enter the name on the card.'),
  cardnumber: (v) =>
    !v
      ? 'Please enter a card number.'
      : luhn(v.replace(/\s+/g, ''))
        ? null
        : 'That card number isn’t valid. For testing use 4242 4242 4242 4242.',
  exp: (v) => validateExpiry(v),
  cvc: (v) => (/^[0-9]{3,4}$/.test(v) ? null : 'CVC must be 3 or 4 digits.'),
};

function luhn(digits: string): boolean {
  if (!/^[0-9]{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function validateExpiry(value: string): string | null {
  const match = value.trim().match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/);
  if (!match) return 'Expiry must be in MM/YY format.';

  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const now = new Date();
  const expiry = new Date(year, month, 1); // first day of the following month
  if (expiry <= new Date(now.getFullYear(), now.getMonth(), 1)) {
    return 'That card has expired.';
  }
  return null;
}

function showFieldError(input: HTMLElement, message: string): void {
  const holder = input.closest('label') ?? input.parentElement;
  let error = holder?.querySelector<HTMLDivElement>('.field-error');

  if (holder && !error) {
    error = document.createElement('div');
    error.className = 'field-error';
    error.id = `${input.id || 'field'}-error`;
    error.setAttribute('role', 'alert');
    holder.appendChild(error);
  }

  if (error) {
    error.textContent = message;
    input.setAttribute('aria-describedby', error.id);
  }
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
}

function clearFieldErrors(): void {
  form?.querySelectorAll('.field-error').forEach((el) => el.remove());
  form?.querySelectorAll('[aria-describedby]').forEach((el) => el.removeAttribute('aria-describedby'));
  form?.querySelectorAll('.invalid').forEach((el) => {
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
  });
}

function validateForm(): boolean {
  clearFieldErrors();

  let firstInvalid: HTMLElement | null = null;

  Object.entries(VALIDATORS).forEach(([name, validate]) => {
    const input = field(name);
    if (!input) return;

    const message = validate(input.value.trim());
    if (message) {
      showFieldError(input, message);
      firstInvalid ??= input;
    }
  });

  if (firstInvalid) {
    (firstInvalid as HTMLElement).focus();
    showToast('Please check the highlighted fields.');
    return false;
  }
  return true;
}

/* --- Submit --------------------------------------------------------------- */

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!form || !submitBtn) return;

  if (!validateForm()) return;

  // A declined card leaves an unpaid order behind — reuse it instead of
  // creating a duplicate (the cart was already emptied by the first attempt).
  const pendingId = getPendingOrderId();
  if (!pendingId && (!cart || cart.items.length === 0)) {
    showToast('Your cart is empty.');
    return;
  }

  setBusy(true);

  try {
    const order = pendingId
      ? await reusePendingOrder(pendingId)
      : await createOrder();

    const paid = await payForOrder(order.id);

    setPendingOrderId(null);
    saveOrder(paid);
    sessionStorage.setItem('fashionhub-last-order', JSON.stringify(paid));

    showToast('Payment successful — thank you!');
    window.location.href = `order-success.html?id=${encodeURIComponent(paid.id)}`;
  } catch (error) {
    setBusy(false);
    handlePaymentFailure(error);
  }
}

async function createOrder(): Promise<Order> {
  if (!form) throw new Error('Checkout form is missing');

  const value = (name: string) => (field(name) as HTMLInputElement | HTMLTextAreaElement)?.value.trim() ?? '';

  return api.orders.create({
    email: value('email'),
    firstName: value('firstName'),
    lastName: value('lastName'),
    address: value('address'),
    city: value('city'),
    postalCode: value('postalCode'),
    country: (field('country') as HTMLSelectElement | null)?.value || 'US',
  });
}

async function reusePendingOrder(id: string): Promise<Order> {
  try {
    return await api.orders.get(id);
  } catch {
    // The stored id is stale (expired session, different browser tab) — start over.
    setPendingOrderId(null);
    return createOrder();
  }
}

async function payForOrder(orderId: string): Promise<Order> {
  setPendingOrderId(orderId);

  const card = {
    name: (field('cardname') as HTMLInputElement).value.trim(),
    number: (field('cardnumber') as HTMLInputElement).value.replace(/\s+/g, ''),
    exp: (field('exp') as HTMLInputElement).value.trim(),
    cvc: (field('cvc') as HTMLInputElement).value.trim(),
  };

  return api.orders.pay(orderId, card);
}

function handlePaymentFailure(error: unknown): void {
  if (error instanceof ApiError) {
    // 402 = the gateway declined the card. The order still exists and is payable,
    // so point the user at the card fields rather than the whole form.
    if (error.status === 402) {
      const cardInput = field('cardnumber');
      if (cardInput) showFieldError(cardInput, error.serverMessage ?? 'Your card was declined.');
      showPaymentBanner(error.serverMessage ?? 'Your card was declined. Please try another card.');
      return;
    }

    if (error.status === 409) {
      showPaymentBanner(error.serverMessage ?? 'That order can no longer be paid for.');
      setPendingOrderId(null);
      void renderSummary();
      return;
    }

    showPaymentBanner(error.serverMessage ?? 'We couldn’t place your order. Please try again.');
    setPendingOrderId(null);
    void renderSummary();
    return;
  }

  showPaymentBanner('We couldn’t reach the store. Check your connection and try again.');
}

function showPaymentBanner(message: string): void {
  const banner = document.querySelector<HTMLElement>('[data-payment-error]');
  if (!banner) {
    showToast(message);
    return;
  }
  banner.textContent = message;
  banner.hidden = false;
  banner.focus();
}

function setBusy(busy: boolean): void {
  if (!submitBtn) return;

  if (busy) {
    submitBtn.dataset.label = submitBtn.textContent ?? 'Place order';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing payment…';
    const banner = document.querySelector<HTMLElement>('[data-payment-error]');
    if (banner) banner.hidden = true;
    return;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = submitBtn.dataset.label || 'Place order';
}

/** Reads the public storefront config so the payment notice is honest about the mode. */
async function loadStoreConfig(): Promise<void> {
  try {
    storeConfig = await api.storeConfig();
  } catch (error) {
    console.warn('Could not load the store configuration:', error);
    return;
  }

  const note = document.querySelector<HTMLElement>('[data-payment-notice]');
  if (note && storeConfig.payment.notice) {
    note.textContent = storeConfig.payment.notice;
    note.hidden = false;
  }

  const provider = document.querySelector<HTMLElement>('[data-payment-provider]');
  if (provider) provider.textContent = storeConfig.payment.provider;

  // In demo mode the card fields are simulated; with Stripe they'd be replaced
  // by Elements, so hide the raw inputs entirely.
  document.body.dataset.paymentProvider = storeConfig.payment.provider;
}

/* --- Init ------------------------------------------------------------------ */

function init(): void {
  if (!form) return;

  // Pre-fill from the signed-in account, else from a previous newsletter sign-up.
  const user = getUser();
  const savedEmail = getSubscriberEmail();

  const emailInput = field('email') as HTMLInputElement | null;
  if (emailInput && !emailInput.value) {
    emailInput.value = user?.email ?? savedEmail;
  }

  const firstNameInput = field('firstName') as HTMLInputElement | null;
  if (firstNameInput && !firstNameInput.value && user?.firstName) {
    firstNameInput.value = user.firstName;
  }
  const lastNameInput = field('lastName') as HTMLInputElement | null;
  if (lastNameInput && !lastNameInput.value && user?.lastName) {
    lastNameInput.value = user.lastName;
  }

  if (user?.firstName) {
    const cardName = field('cardname') as HTMLInputElement | null;
    if (cardName && !cardName.value) {
      cardName.value = [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
  }

  // Live formatting for the card fields.
  const cardNumber = field('cardnumber') as HTMLInputElement | null;
  cardNumber?.addEventListener('input', () => {
    const digits = cardNumber.value.replace(/\D/g, '').slice(0, 19);
    cardNumber.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });

  const expiry = field('exp') as HTMLInputElement | null;
  expiry?.addEventListener('input', () => {
    const digits = expiry.value.replace(/\D/g, '').slice(0, 4);
    expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });

  const cvc = field('cvc') as HTMLInputElement | null;
  cvc?.addEventListener('input', () => {
    cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4);
  });

  form.addEventListener('submit', (event) => void handleSubmit(event));
  void loadStoreConfig();
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('invalid')) return;
    target.classList.remove('invalid');
    target.removeAttribute('aria-invalid');
    (target.closest('label') ?? target.parentElement)?.querySelector('.field-error')?.remove();
  });

  void renderSummary();
}

onReady(() => {
  // Render the signed-in header, then wire up the form.
  void bootstrapCommon().then(init);
});
