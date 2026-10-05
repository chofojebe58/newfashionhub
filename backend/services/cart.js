import { db } from '../db.js';
import { priceCart } from './pricing.js';

/**
 * Resolves who a cart belongs to.
 * Logged-in users are keyed by userId; guests by the `X-Session-Id` they send.
 * Returns null when neither is available.
 */
export function getCartIdentifier(req) {
  if (req.user?.userId) {
    return { userId: req.user.userId };
  }

  const sessionId =
    req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId;

  if (!sessionId) return null;

  return { sessionId: String(sessionId).slice(0, 128) };
}

function validateCartIdentifier(ident) {
  if (!ident) throw new Error('Cart identifier is required');
  if (!ident.userId && !ident.sessionId) throw new Error('Invalid cart identifier');
}

/** `ci.user_id = ?` or `ci.session_id = ?` plus its bound value. */
function identifierClause(ident) {
  return ident.userId
    ? { sql: 'ci.user_id = ?', params: [ident.userId] }
    : { sql: 'ci.session_id = ?', params: [ident.sessionId] };
}

const CART_SELECT = `
  SELECT
    ci.*,
    p.name,
    p.price,
    p.image,
    p.old_price,
    pv.size,
    pv.color,
    pv.sku
  FROM cart_items ci
  JOIN products p ON ci.product_id = p.id
  LEFT JOIN product_variants pv ON ci.variant_id = pv.id
  WHERE `;

/**
 * Public cart shape. The rest of the API returns camelCase DTOs, so the cart
 * does too — clients should never have to know the column names.
 */
function toCartItemDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id ?? undefined,
    name: row.name,
    price: Number(row.price),
    image: row.image ?? '',
    oldPrice: row.old_price == null ? undefined : Number(row.old_price),
    quantity: Number(row.quantity),
    size: row.size ?? undefined,
    color: row.color ?? undefined,
    sku: row.sku ?? undefined,
    addedAt: row.created_at,
  };
}

export function getCartItems(ident) {
  validateCartIdentifier(ident);
  const { sql, params } = identifierClause(ident);
  const rows = db.prepare(CART_SELECT + sql).all(...params);
  return priceCart(rows.map(toCartItemDto));
}

/** Shape returned when there is no cart identity at all (anonymous, no session id). */
export function emptyCart() {
  return priceCart([]);
}

export function getCartItemsForCheckout(ident) {
  validateCartIdentifier(ident);
  const { sql, params } = identifierClause(ident);
  return db.prepare(
    `SELECT ci.*, p.name, p.price, p.image, pv.size, pv.color
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     LEFT JOIN product_variants pv ON ci.variant_id = pv.id
     WHERE ${sql}`
  ).all(...params);
}

export function clearCart(ident) {
  validateCartIdentifier(ident);
  return ident.userId
    ? db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(ident.userId)
    : db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(ident.sessionId);
}

/**
 * Stock that can actually be sold for a cart line: the variant's stock when a
 * variant is selected, otherwise the product's.
 */
export function availableStock(productId, variantId) {
  if (variantId) {
    const variant = db
      .prepare('SELECT stock FROM product_variants WHERE id = ?')
      .get(variantId);
    return variant ? Number(variant.stock) : 0;
  }
  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
  return product ? Number(product.stock) : 0;
}

/**
 * Moves a guest's cart onto their account after login.
 *
 * Matching lines (same product + variant) are merged and clamped to available
 * stock; everything else is simply re-owned. Returns the number of lines
 * absorbed so the caller can report it.
 */
export const mergeGuestCartIntoUser = db.transaction((sessionId, userId) => {
  if (!sessionId || !userId) return { merged: 0, items: [] };

  const guestItems = db
    .prepare('SELECT * FROM cart_items WHERE session_id = ? AND user_id IS NULL')
    .all(sessionId);

  if (!guestItems.length) return { merged: 0, items: [] };

  const findUserLine = db.prepare(`
    SELECT * FROM cart_items
    WHERE user_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
  `);
  const claimLine = db.prepare(
    'UPDATE cart_items SET user_id = ?, session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  const bumpLine = db.prepare(
    'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  const dropLine = db.prepare('DELETE FROM cart_items WHERE id = ?');

  let merged = 0;

  for (const guest of guestItems) {
    const existing = findUserLine.get(userId, guest.product_id, guest.variant_id, guest.variant_id);
    const cap = availableStock(guest.product_id, guest.variant_id);

    // Nothing left to sell — drop the guest line rather than strand it.
    if (cap <= 0) {
      dropLine.run(guest.id);
      continue;
    }

    if (!existing) {
      const quantity = Math.min(guest.quantity, cap);
      claimLine.run(userId, guest.id);
      if (quantity !== guest.quantity) bumpLine.run(quantity, guest.id);
      merged += 1;
      continue;
    }

    bumpLine.run(Math.min(existing.quantity + guest.quantity, cap), existing.id);
    dropLine.run(guest.id);
    merged += 1;
  }

  return { merged, items: getCartItems({ userId }).items };
});
