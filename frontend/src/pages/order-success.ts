import '@styles/main.css';

import { api } from '@api/client.ts';
import { formatCurrency } from '@utils/format.ts';
import { escapeAttr, escapeHtml, formatList, safeUrl } from '@utils/escape.ts';
import { getOrder, saveOrder } from '@utils/storage.ts';
import type { Order } from '@app-types/cart.ts';

const SESSION_KEY = 'fashionhub-last-order';

const messageEl = document.querySelector<HTMLElement>('#order-message');
const detailsEl = document.querySelector<HTMLElement>('#order-details');

/**
 * Resolves the order to display:
 *   1. `?id=` in the URL → re-read it from the API (authoritative)
 *   2. the copy checkout.html left in sessionStorage
 *   3. the local order mirror in localStorage
 */
async function resolveOrder(): Promise<Order | null> {
  const id = new URLSearchParams(window.location.search).get('id');

  if (id) {
    try {
      const order = await api.orders.get(id);
      if (order?.id) {
        saveOrder(order);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(order));
        return order;
      }
    } catch (error) {
      console.warn('Could not re-read the order from the API:', error);
    }
  }

  const fromSession = readJson<Order>(sessionStorage.getItem(SESSION_KEY));
  if (fromSession?.id) return fromSession;

  if (id) {
    const fromMirror = getOrder(id);
    if (fromMirror) return fromMirror;
  }

  return null;
}

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function render(order: Order): void {
  if (messageEl) {
    messageEl.textContent = `Order ${order.id} · ${formatDate(order.date)}`;
  }

  if (!detailsEl) return;

  if (!order.items?.length) {
    detailsEl.innerHTML = '<p>Your order contains no items.</p>';
    return;
  }

  const shippingLabel =
    Number(order.shipping) === 0 ? 'Free' : formatCurrency(Number(order.shipping));

  detailsEl.innerHTML = `
    <h3>Items</h3>
    <ul class="order-list">
      ${order.items
        .map((item) => {
          const variant = formatList([item.size, item.color]);
          const name = escapeAttr(item.name);
          return `
        <li class="order-list-item">
          <img src="${safeUrl(item.image, '')}" alt="${name}" loading="lazy" decoding="async" />
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${variant ? `<span>${escapeHtml(variant)}</span>` : ''}
            <span>${escapeHtml(item.quantity)} × ${formatCurrency(Number(item.price))}</span>
          </div>
          <span class="order-line-total">${formatCurrency(
            Number(item.price) * Number(item.quantity)
          )}</span>
        </li>`;
        })
        .join('')}
    </ul>

    <dl class="order-totals">
      <div><dt>Subtotal</dt><dd>${formatCurrency(Number(order.subtotal))}</dd></div>
      <div><dt>Shipping</dt><dd>${escapeHtml(shippingLabel)}</dd></div>
      <div><dt>Tax</dt><dd>${formatCurrency(Number(order.tax))}</dd></div>
      <div class="grand"><dt>Total</dt><dd>${formatCurrency(Number(order.total))}</dd></div>
    </dl>

    ${
      order.customer?.address
        ? `<h3>Shipping to</h3>
           <address class="order-address">
             ${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}<br />
             ${escapeHtml(order.customer.address)}<br />
             ${escapeHtml(order.customer.city)} ${escapeHtml(order.customer.postalCode)}<br />
             ${escapeHtml(order.customer.country)}
           </address>`
        : ''
    }

    ${
      order.payment?.last4
        ? `<p class="order-payment">Paid with a card ending in <strong>${escapeHtml(
            order.payment.last4
          )}</strong>${order.payment.provider ? ` · ${escapeHtml(order.payment.provider)}` : ''}</p>`
        : ''
    }

    <p class="order-status">Status: <strong>${escapeHtml(prettyStatus(order.status))}</strong></p>
    ${
      order.status === 'pending_payment'
        ? `<p class="order-unpaid" role="note">
             This order is still awaiting payment.
             <a href="checkout.html">Return to checkout</a> to complete it.
           </p>`
        : ''
    }
  `;
}

function renderEmpty(): void {
  if (messageEl) messageEl.textContent = 'No recent order found.';
  if (detailsEl) {
    detailsEl.innerHTML = `
      <p>We couldn’t find an order to show. If you just checked out, your confirmation is on its
      way to your inbox.</p>
      <p><a class="btn btn-light" href="shop.html">Return to the shop</a></p>`;
  }
}

async function init(): Promise<void> {
  const order = await resolveOrder();
  if (!order) {
    renderEmpty();
    return;
  }
  render(order);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
