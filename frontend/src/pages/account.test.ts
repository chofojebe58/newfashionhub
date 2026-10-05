/**
 * The account page's profile form, against an in-memory stub of the API.
 *
 * Regression: a profile saved with one blank name used to be rejected with a
 * bare "Required" toast, which made it look as though names could not be
 * changed at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface StubUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
}

let user: StubUser;
let patchCalls: Array<Record<string, string>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installApi(): void {
  patchCalls = [];

  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url === '/api/auth/me' && method === 'GET') return jsonResponse({ user });

    if (url === '/api/auth/me' && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      patchCalls.push(body);

      const keys = Object.keys(body);
      if (keys.length === 0) {
        return jsonResponse(
          { error: 'Validation failed', errors: { formErrors: ['Nothing to update'], fieldErrors: {} } },
          400
        );
      }
      // Mirror the server: an empty string clears the field.
      if ('firstName' in body) user = { ...user, firstName: body.firstName };
      if ('lastName' in body) user = { ...user, lastName: body.lastName };
      return jsonResponse({ user });
    }

    if (url.startsWith('/api/cart')) {
      return jsonResponse({
        items: [], count: 0, subtotal: 0, shipping: 0, tax: 0, total: 0,
        currency: 'USD', freeShippingThreshold: 99,
      });
    }
    if (url.startsWith('/api/products')) return jsonResponse([]);
    if (url.startsWith('/api/wishlist')) return jsonResponse({ items: [] });
    if (url.startsWith('/api/orders')) return jsonResponse([]);

    return jsonResponse({ error: 'not found' }, 404);
  }));
}

async function mountAccountPage(): Promise<void> {
  document.body.innerHTML = `
    <header class="topbar"><div class="account-slot" data-account-slot></div></header>
    <main id="main"><div id="account-root"></div></main>
    <aside class="cart-panel">
      <button class="cart-toggle" type="button">Cart</button>
      <ul class="cart-items"></ul>
    </aside>
  `;

  localStorage.setItem('auth_token', 'test-token');
  localStorage.setItem('auth_user', JSON.stringify(user));

  vi.resetModules();
  await import('./account.ts');

  await vi.waitFor(() => {
    expect(document.querySelector('[data-profile-form]')).not.toBeNull();
  }, { timeout: 5000 });
}

function saveProfile(firstName: string, lastName: string): void {
  const form = document.querySelector<HTMLFormElement>('[data-profile-form]')!;
  form.querySelector<HTMLInputElement>('input[name="firstName"]')!.value = firstName;
  form.querySelector<HTMLInputElement>('input[name="lastName"]')!.value = lastName;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('account page — editing your own name', () => {
  beforeEach(() => {
    localStorage.clear();
    user = { id: 7, email: 'owner@example.com', firstName: 'aaaa aaaa', lastName: '', role: 'admin' };
    installApi();
  });

  it('saves a new name with the last name left blank', async () => {
    await mountAccountPage();

    saveProfile('Cynthia', '');

    await vi.waitFor(() => {
      expect(patchCalls.length).toBe(1);
    });
    expect(patchCalls[0]).toEqual({ firstName: 'Cynthia', lastName: '' });

    await vi.waitFor(() => {
      expect(document.querySelector('#account-root')!.innerHTML).toContain('Hello, Cynthia');
    });

    const first = document.querySelector<HTMLInputElement>('input[name="firstName"]');
    expect(first?.value).toBe('Cynthia');
  });

  it('saves both names', async () => {
    await mountAccountPage();
    saveProfile('Cynthia', 'Ofojebe');

    await vi.waitFor(() => {
      expect(document.querySelector('#account-root')!.innerHTML).toContain('Hello, Cynthia');
    });
    expect(patchCalls[0]).toEqual({ firstName: 'Cynthia', lastName: 'Ofojebe' });
  });

  it('shows the server error next to the field that caused it', async () => {
    // Stub a stricter server so we can prove the inline error path renders.
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/auth/me' && method === 'GET') return jsonResponse({ user });
      if (url === '/api/auth/me' && method === 'PATCH') {
        return jsonResponse(
          {
            error: 'Validation failed',
            errors: { formErrors: [], fieldErrors: { lastName: ['Required'] } },
          },
          400
        );
      }
      if (url.startsWith('/api/cart')) {
        return jsonResponse({ items: [], count: 0, subtotal: 0, shipping: 0, tax: 0, total: 0, currency: 'USD', freeShippingThreshold: 99 });
      }
      if (url.startsWith('/api/products')) return jsonResponse([]);
      if (url.startsWith('/api/wishlist')) return jsonResponse({ items: [] });
      return jsonResponse({ error: 'not found' }, 404);
    }));

    await mountAccountPage();
    saveProfile('Cynthia', '');

    await vi.waitFor(() => {
      const box = document.querySelector('[data-profile-form] .field-error');
      expect(box).not.toBeNull();
      expect(box!.textContent).toContain('Last name');
    });

    const invalid = document.querySelector('[data-profile-form] input[name="lastName"]');
    expect(invalid?.classList.contains('invalid')).toBe(true);
    expect(invalid?.getAttribute('aria-invalid')).toBe('true');
  });

  it('typing in a field clears its error', async () => {
    await mountAccountPage();

    const form = document.querySelector<HTMLFormElement>('[data-profile-form]')!;
    const last = form.querySelector<HTMLInputElement>('input[name="lastName"]')!;
    last.classList.add('invalid');
    const holder = last.closest('label')!;
    const box = document.createElement('div');
    box.className = 'field-error';
    box.textContent = 'Last name: is required';
    holder.appendChild(box);

    last.value = 'O';
    last.dispatchEvent(new Event('input', { bubbles: true }));

    expect(last.classList.contains('invalid')).toBe(false);
    expect(holder.querySelector('.field-error')).toBeNull();
  });
});
