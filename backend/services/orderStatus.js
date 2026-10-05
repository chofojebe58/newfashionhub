/**
 * Order lifecycle.
 *
 *   pending_payment → paid → shipped → delivered
 *                   ↘ cancelled  (restocks reserved inventory)
 *   any paid state  → refunded
 */
export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

export const PAID_STATUSES = ['paid', 'shipped', 'delivered'];

export function isPaid(status) {
  return PAID_STATUSES.includes(status);
}

export function canCancel(status) {
  return status === 'pending_payment';
}
