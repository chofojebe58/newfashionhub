import { getUser, isAdmin, isSignedIn, logout, subscribeSession } from './session.ts';
import { escapeHtml } from '@utils/escape.ts';
import { showToast } from '@components/ui/Toast.ts';

/**
 * Renders the account area of the header.
 *
 * Every page just needs `<div data-account-slot></div>` in its topbar; this
 * keeps the markup in one place instead of duplicated across six HTML files.
 */
const SLOT = '[data-account-slot]';

let slot: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;

export function initAccountHeader(): void {
  slot = document.querySelector<HTMLElement>(SLOT);
  if (!slot) return;

  render();
  unsubscribe?.();
  unsubscribe = subscribeSession(render);

  // Close the dropdown on Escape or an outside click.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('.account-menu')) return;
    closeMenu();
  });
}

function signedOutMarkup(): string {
  return `<a class="account-link" href="account.html">Sign in</a>`;
}

function signedInMarkup(firstName: string, admin: boolean): string {
  const name = escapeHtml(firstName || 'Account');
  return `
    <div class="account-menu">
      <button
        type="button"
        class="account-toggle"
        aria-expanded="false"
        aria-haspopup="menu"
        aria-controls="account-dropdown"
      >
        <span class="account-avatar" aria-hidden="true">${escapeHtml((firstName || 'A').charAt(0).toUpperCase())}</span>
        <span class="account-name">${name}</span>
        <span class="account-caret" aria-hidden="true">▾</span>
      </button>

      <div class="account-dropdown" id="account-dropdown" role="menu" hidden>
        <a role="menuitem" href="account.html">Account details</a>
        <a role="menuitem" href="account.html#orders">Order history</a>
        <a role="menuitem" href="account.html#wishlist">Wishlist</a>
        ${
          admin
            ? '<a role="menuitem" class="account-admin-link" href="admin.html">Store admin</a>'
            : ''
        }
        <button role="menuitem" type="button" data-sign-out>Sign out</button>
      </div>
    </div>
  `;
}

function render(): void {
  if (!slot) return;

  const user = getUser();
  slot.innerHTML =
    isSignedIn() && user ? signedInMarkup(user.firstName, isAdmin()) : signedOutMarkup();
  bind();
}

function bind(): void {
  const toggle = slot?.querySelector<HTMLButtonElement>('.account-toggle');
  const dropdown = slot?.querySelector<HTMLElement>('.account-dropdown');

  toggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dropdown?.hasAttribute('hidden');
    if (open) openMenu();
    else closeMenu();
  });

  slot?.querySelector<HTMLButtonElement>('[data-sign-out]')?.addEventListener('click', () => {
    logout();
    closeMenu();
    showToast('You’ve been signed out.');
    // Reload so the cart, wishlist and header all re-read the signed-out state.
    window.location.href = window.location.pathname;
  });
}

function openMenu(): void {
  const dropdown = slot?.querySelector<HTMLElement>('.account-dropdown');
  const toggle = slot?.querySelector<HTMLButtonElement>('.account-toggle');
  dropdown?.removeAttribute('hidden');
  toggle?.setAttribute('aria-expanded', 'true');
}

function closeMenu(): void {
  const dropdown = slot?.querySelector<HTMLElement>('.account-dropdown');
  const toggle = slot?.querySelector<HTMLButtonElement>('.account-toggle');
  if (!dropdown || dropdown.hasAttribute('hidden')) return;
  dropdown.setAttribute('hidden', '');
  toggle?.setAttribute('aria-expanded', 'false');
}
