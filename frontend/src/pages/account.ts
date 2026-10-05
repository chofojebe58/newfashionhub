import '@styles/main.css';

import { bootstrapCommon, onReady } from '../bootstrap.ts';
import { initCart } from '@features/cart/state.ts';
import { initCartUI } from '@features/cart/ui.ts';
import { createProductCard, initAddToCart } from '@features/products/render.ts';
import { getProduct, loadCatalog } from '@features/products/catalog.ts';
import {
  changePassword,
  getUser,
  isSignedIn,
  login,
  logout,
  register,
  subscribeSession,
  updateProfile,
} from '@features/auth/session.ts';
import { api, ApiError, type AuthUser } from '@api/client.ts';
import { showToast } from '@components/ui/Toast.ts';
import { formatCurrency } from '@utils/format.ts';
import { escapeAttr, escapeHtml, safeUrl } from '@utils/escape.ts';
import { clearWishlist, getWishlist, subscribeWishlist, toggleWishlist } from '@features/user/Wishlist.ts';
import type { Order } from '@app-types/cart.ts';

const root = document.querySelector<HTMLElement>('#account-root');

/* ================================
   Auth forms (signed out)
================================ */

let authMode: 'login' | 'register' = 'login';

function authView(): string {
  const isRegister = authMode === 'register';
  return `
    <section class="auth-panel">
      <p class="eyebrow">${isRegister ? 'Create an account' : 'Welcome back'}</p>
      <h1>${isRegister ? 'Join LUNORA' : 'Sign in'}</h1>
      <p class="auth-lede">
        ${
          isRegister
            ? 'Save your favourites, track orders and check out faster.'
            : 'Sign in to see your orders and wishlist.'
        }
      </p>

      <div class="auth-tabs" role="tablist" aria-label="Sign in or create an account">
        <button type="button" role="tab" data-auth-tab="login"
          aria-selected="${!isRegister}" class="${isRegister ? '' : 'active'}">Sign in</button>
        <button type="button" role="tab" data-auth-tab="register"
          aria-selected="${isRegister}" class="${isRegister ? 'active' : ''}">Create account</button>
      </div>

      <form class="auth-form" data-auth-form novalidate>
        ${
          isRegister
            ? `<div class="form-grid">
                <label><span>First name</span>
                  <input type="text" name="firstName" id="firstName" autocomplete="given-name" placeholder="Jane" />
                </label>
                <label><span>Last name</span>
                  <input type="text" name="lastName" id="lastName" autocomplete="family-name" placeholder="Smith" />
                </label>
              </div>`
            : ''
        }

        <label>
          <span>Email</span>
          <input type="email" name="email" id="email" autocomplete="email"
            placeholder="jane@example.com" required aria-required="true" />
        </label>

        <label>
          <span>Password</span>
          <input type="password" name="password" id="password"
            autocomplete="${isRegister ? 'new-password' : 'current-password'}"
            placeholder="${isRegister ? 'At least 8 characters' : 'Your password'}"
            required aria-required="true" ${isRegister ? 'minlength="8"' : ''} />
          ${isRegister ? '<span class="field-hint">Minimum 8 characters.</span>' : ''}
        </label>

        <p class="form-error" data-form-error role="alert" hidden></p>

        <button type="submit" class="btn btn-primary auth-submit">
          ${isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p class="auth-footnote">
        Guest checkout works too — signing in just keeps your cart and favourites in sync.
      </p>
    </section>
  `;
}

function bindAuthView(): void {
  root?.querySelectorAll<HTMLButtonElement>('[data-auth-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.authTab as 'login' | 'register';
      if (mode === authMode) return;
      authMode = mode;
      render();
    });
  });

  const form = root?.querySelector<HTMLFormElement>('[data-auth-form]');
  form?.addEventListener('submit', (event) => void handleAuthSubmit(event, form));
}

async function handleAuthSubmit(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
  event.preventDefault();

  const errorEl = form.querySelector<HTMLElement>('[data-form-error]');
  const submit = form.querySelector<HTMLButtonElement>('.auth-submit');
  const data = new FormData(form);

  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');

  if (!errorEl || !submit) return;
  errorEl.hidden = true;

  if (!email || !password) {
    showFormError(errorEl, 'Enter your email and password.');
    return;
  }
  if (authMode === 'register' && password.length < 8) {
    showFormError(errorEl, 'Your password must be at least 8 characters.');
    return;
  }

  submit.disabled = true;
  const label = submit.textContent ?? '';
  submit.textContent = authMode === 'register' ? 'Creating…' : 'Signing in…';

  try {
    const user =
      authMode === 'register'
        ? await register({
            email,
            password,
            firstName: String(data.get('firstName') ?? '').trim() || undefined,
            lastName: String(data.get('lastName') ?? '').trim() || undefined,
          })
        : await login(email, password);

    showToast(`Welcome${user.firstName ? `, ${user.firstName}` : ''}!`);
    render();
  } catch (error) {
    submit.disabled = false;
    submit.textContent = label;
    if (!showFieldErrors(form, error)) {
      showFormError(errorEl, messageFor(error, 'Sorry, that didn’t work. Please try again.'));
    }
  }
}

function showFormError(el: HTMLElement, message: string): void {
  el.textContent = message;
  el.hidden = false;
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  password: 'Password',
  currentPassword: 'Current password',
  newPassword: 'New password',
};

/**
 * Renders server-side field errors underneath the offending input, so a failed
 * save is visible next to the box you need to fix rather than as a bare toast.
 * Returns false when the error has no field detail (caller falls back).
 */
function showFieldErrors(form: HTMLFormElement, error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;

  const fieldErrors = (error.data as { errors?: { fieldErrors?: Record<string, string[]> } })
    ?.errors?.fieldErrors;
  if (!fieldErrors || Object.keys(fieldErrors).length === 0) return false;

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const input = form.querySelector<HTMLElement>(`[name="${field}"]`);
    const message = messages?.[0];
    if (!input || !message) continue;

    const holder = input.closest('label') ?? input.parentElement;
    let box = holder?.querySelector<HTMLElement>('.field-error');
    if (holder && !box) {
      box = document.createElement('div');
      box.className = 'field-error';
      box.setAttribute('role', 'alert');
      holder.appendChild(box);
    }
    if (box) box.textContent = `${FIELD_LABELS[field] ?? field}: ${message === 'Required' ? 'is required' : message}`;
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
  }
  return true;
}

function clearFieldErrors(form: HTMLFormElement): void {
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  form.querySelectorAll('.invalid').forEach((el) => {
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
  });
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return error.serverMessage ?? 'Incorrect email or password.';
    if (error.status === 409) return error.serverMessage ?? 'That email is already registered.';
    if (error.status === 400) {
      const fields = (error.data as { errors?: { fieldErrors?: Record<string, string[]> } })?.errors
        ?.fieldErrors;
      const first = fields ? Object.values(fields)[0]?.[0] : undefined;
      return first ?? error.serverMessage ?? fallback;
    }
    return error.serverMessage ?? fallback;
  }
  return fallback;
}

/* ================================
   Dashboard (signed in)
================================ */

let orders: Order[] = [];
let ordersLoaded = false;

function dashboardView(user: AuthUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'your account';

  return `
    <section class="account-header">
      <div>
        <p class="eyebrow">Your account</p>
        <h1>Hello, ${escapeHtml(user.firstName || 'there')}</h1>
        <p class="account-email">${escapeHtml(user.email)}</p>
      </div>
      <button type="button" class="btn btn-light" data-sign-out>Sign out</button>
    </section>

    <nav class="account-nav" aria-label="Account sections">
      <a href="#details">Details</a>
      <a href="#orders">Orders</a>
      <a href="#wishlist">Wishlist</a>
      <a href="#password">Password</a>
    </nav>

    <section class="account-section" id="details">
      <h2>Your details</h2>
      <form class="account-form" data-profile-form novalidate>
        <div class="form-grid">
          <label><span>First name</span>
            <input type="text" name="firstName" value="${escapeAttr(user.firstName ?? '')}"
              autocomplete="given-name" />
          </label>
          <label><span>Last name</span>
            <input type="text" name="lastName" value="${escapeAttr(user.lastName ?? '')}"
              autocomplete="family-name" />
          </label>
        </div>
        <label><span>Email</span>
          <input type="email" value="${escapeAttr(user.email)}" disabled
            aria-describedby="email-locked-hint" />
          <span class="field-hint" id="email-locked-hint">
            Your email address can’t be changed here.
          </span>
        </label>
        <p class="form-note">Signed up ${escapeHtml(formatDate(user.createdAt))} ·
          role: <strong>${escapeHtml(user.role)}</strong></p>
        <button type="submit" class="btn btn-primary">Save details</button>
      </form>
    </section>

    <section class="account-section" id="orders">
      <h2>Order history</h2>
      <div data-orders>${ordersLoaded ? renderOrders() : '<p class="account-loading">Loading your orders…</p>'}</div>
    </section>

    <section class="account-section" id="wishlist">
      <h2>Wishlist</h2>
      <div data-wishlist>${renderWishlist()}</div>
    </section>

    <section class="account-section" id="password">
      <h2>Change password</h2>
      <form class="account-form" data-password-form novalidate>
        <label><span>Current password</span>
          <input type="password" name="currentPassword" autocomplete="current-password" required />
        </label>
        <label><span>New password</span>
          <input type="password" name="newPassword" autocomplete="new-password"
            minlength="8" required />
          <span class="field-hint">Minimum 8 characters, and different from your current one.</span>
        </label>
        <p class="form-error" data-password-error role="alert" hidden></p>
        <button type="submit" class="btn btn-primary">Update password</button>
      </form>
    </section>

    <p class="account-signed-in-as">Signed in as ${escapeHtml(fullName)}</p>
  `;
}

function renderOrders(): string {
  if (!orders.length) {
    return `<div class="empty-state">
      <p>You haven’t placed an order yet.</p>
      <a class="btn btn-light" href="shop.html">Start shopping</a>
    </div>`;
  }

  return `
    <ul class="order-history">
      ${orders
        .map((order) => {
          const firstImage = order.items?.[0]?.image;
          return `
        <li class="order-history-item">
          ${firstImage ? `<img src="${safeUrl(firstImage, '')}" alt="" loading="lazy" decoding="async" />` : ''}
          <div class="order-history-main">
            <a class="order-history-id" href="order-success.html?id=${encodeURIComponent(order.id)}">
              ${escapeHtml(order.id)}
            </a>
            <span class="order-history-meta">
              ${escapeHtml(formatDate(order.date))} ·
              ${escapeHtml(order.items?.length ?? 0)} item${order.items?.length === 1 ? '' : 's'}
            </span>
            <span class="order-status-pill status-${escapeAttr(order.status)}">
              ${escapeHtml(prettyStatus(order.status))}
            </span>
          </div>
          <div class="order-history-side">
            <strong>${formatCurrency(Number(order.total))}</strong>
            <a href="order-success.html?id=${encodeURIComponent(order.id)}">View</a>
          </div>
        </li>`;
        })
        .join('')}
    </ul>
  `;
}

function renderWishlist(): string {
  const ids = getWishlist();

  if (!ids.length) {
    return `<div class="empty-state">
      <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
      <a class="btn btn-light" href="shop.html">Browse the shop</a>
    </div>`;
  }

  return `
    <div class="wishlist-actions">
      <button type="button" class="btn btn-light" data-clear-wishlist>Clear wishlist</button>
    </div>
    <div class="product-grid wishlist-grid" data-wishlist-grid></div>
  `;
}

function prettyStatus(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Awaiting payment';
    case 'paid':
      return 'Paid';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function bindDashboard(): void {
  root?.querySelector<HTMLButtonElement>('[data-sign-out]')?.addEventListener('click', () => {
    logout();
    showToast('You’ve been signed out.');
    render();
  });

  const profileForm = root?.querySelector<HTMLFormElement>('[data-profile-form]');
  profileForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = profileForm;
    const data = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    clearFieldErrors(form);

    updateProfile({
      firstName: String(data.get('firstName') ?? '').trim(),
      lastName: String(data.get('lastName') ?? '').trim(),
    })
      .then(() => {
        showToast('Your details were saved.');
        clearFieldErrors(form);
      })
      .catch((error) => {
        if (!showFieldErrors(form, error)) {
          showToast(messageFor(error, 'Could not save your details.'));
        }
      })
      .finally(() => {
        if (submit) submit.disabled = false;
      });
  });

  // Typing clears that field's error.
  profileForm?.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('invalid')) return;
    target.classList.remove('invalid');
    target.removeAttribute('aria-invalid');
    (target.closest('label') ?? target.parentElement)?.querySelector('.field-error')?.remove();
  });

  const passwordForm = root?.querySelector<HTMLFormElement>('[data-password-form]');
  passwordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = passwordForm;
    const errorEl = form.querySelector<HTMLElement>('[data-password-error]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const data = new FormData(form);

    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');

    if (newPassword.length < 8) {
      if (errorEl) showFormError(errorEl, 'Your new password must be at least 8 characters.');
      return;
    }
    if (submit) submit.disabled = true;

    changePassword(currentPassword, newPassword)
      .then(() => {
        form.reset();
        showToast('Password updated.');
      })
      .catch((error) => {
        if (!showFieldErrors(form, error) && errorEl) {
          showFormError(errorEl, messageFor(error, 'Could not change your password.'));
        }
      })
      .finally(() => {
        if (submit) submit.disabled = false;
      });
  });

  root?.querySelector<HTMLButtonElement>('[data-clear-wishlist]')?.addEventListener('click', () => {
    if (!window.confirm('Remove everything from your wishlist?')) return;
    clearWishlist();
  });

  root?.querySelectorAll<HTMLButtonElement>('[data-forget]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.forget;
      if (id) toggleWishlist(id);
    });
  });
}

/* ================================
   Render
================================ */

function render(): void {
  if (!root) return;

  const user = getUser();

  if (!isSignedIn() || !user) {
    orders = [];
    ordersLoaded = false;
    root.innerHTML = authView();
    bindAuthView();
    return;
  }

  root.innerHTML = dashboardView(user);
  bindDashboard();
  renderWishlistGrid();
  void loadOrders();
}

function renderWishlistGrid(): void {
  const grid = root?.querySelector<HTMLElement>('[data-wishlist-grid]');
  if (!grid) return;

  const cards = getWishlist()
    .map((id) => {
      const product = getProduct(id);
      return product
        ? createProductCard(product)
        : `<div class="wishlist-missing">
             <p>A saved product is no longer available.</p>
             <button type="button" class="btn btn-light" data-forget="${escapeAttr(id)}">Remove</button>
           </div>`;
    })
    .join('');

  grid.innerHTML = cards;

  // Cards added after boot need the delegated handlers to be present.
  initAddToCart();
}

async function loadOrders(): Promise<void> {
  try {
    orders = await api.orders.list();
    ordersLoaded = true;
  } catch (error) {
    ordersLoaded = true;
    console.warn('Could not load order history:', error);
  }

  const holder = root?.querySelector<HTMLElement>('[data-orders]');
  if (holder) holder.innerHTML = renderOrders();
}

/* ================================
   Boot
================================ */

async function boot(): Promise<void> {
  await bootstrapCommon();

  // The drawer lives on this page too, so wire up the shared cart.
  await Promise.all([initCart(), loadCatalog()]);
  initCartUI();
  initAddToCart();

  render();

  subscribeSession(() => render());
  subscribeWishlist(() => {
    if (!isSignedIn()) return;
    const holder = root?.querySelector<HTMLElement>('[data-wishlist]');
    if (!holder) return;
    holder.innerHTML = renderWishlist();
    bindDashboard();
    renderWishlistGrid();
  });

  // Deep links (#orders, #wishlist) should land in view after the first render.
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    target?.scrollIntoView({ block: 'start' });
  }
}

onReady(() => void boot());
