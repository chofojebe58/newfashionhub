import express from 'express';
import { db } from '../db.js';
import { getCartIdentifier, getCartItemsForCheckout } from '../services/cart.js';
import { priceCart } from '../services/pricing.js';
import { gateway, describeProvider } from '../services/payments.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { ORDER_STATUSES, canCancel } from '../services/orderStatus.js';

const router = express.Router();

const ORDER_COLUMNS = `id, user_id, session_id, email, first_name, last_name, address,
  city, postal_code, country, subtotal, shipping, tax, total, status, payment_intent_id,
  payment_provider, paid_at, card_last4, failure_reason, created_at, updated_at`;

const ORDER_ITEM_SELECT = `
  SELECT oi.*, pv.size, pv.color
  FROM order_items oi
  LEFT JOIN product_variants pv ON oi.variant_id = pv.id
  WHERE oi.order_id = ?
  ORDER BY oi.id`;

export { ORDER_STATUSES };

function toOrderDto(row, items = []) {
  return {
    id: row.id,
    orderId: row.id,
    date: row.created_at,
    status: row.status,
    email: row.email,
    customer: {
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      address: row.address,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country,
    },
    subtotal: row.subtotal,
    shipping: row.shipping,
    tax: row.tax,
    total: row.total,
    payment: {
      provider: row.payment_provider ?? null,
      intentId: row.payment_intent_id ?? null,
      last4: row.card_last4 ?? null,
      paidAt: row.paid_at ?? null,
      failureReason: row.failure_reason ?? null,
    },
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      image: i.image,
      size: i.size ?? undefined,
      color: i.color ?? undefined,
    })),
  };
}

function loadOrder(id) {
  const row = db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).get(id);
  if (!row) return null;
  return toOrderDto(row, db.prepare(ORDER_ITEM_SELECT).all(id));
}

/** The signed-in owner, or the guest session that placed the order. */
function canAccessOrder(order, req) {
  if (!order) return false;
  if (req.user?.userId && order.user_id === req.user.userId) return true;
  const sessionId = req.headers['x-session-id'];
  return Boolean(sessionId && order.session_id && order.session_id === String(sessionId));
}

function findOwnedOrder(req, res) {
  const row = db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).get(req.params.id);
  if (!canAccessOrder(row, req)) {
    res.status(404).json({ error: 'Order not found' });
    return null;
  }
  return row;
}

/* ---------------------------------------------------------------- create */

router.post('/', optionalAuth, validate(schemas.checkout), async (req, res, next) => {
  const ident = getCartIdentifier(req);
  if (!ident) {
    return res.status(400).json({ error: 'A session id or auth token is required' });
  }

  try {
    const cartItems = getCartItemsForCheckout(ident);
    if (!cartItems.length) return res.status(400).json({ error: 'Your cart is empty' });

    // Re-validate stock at purchase time — the cart may have been open for days.
    for (const item of cartItems) {
      const row = item.variant_id
        ? db.prepare('SELECT stock FROM product_variants WHERE id = ?').get(item.variant_id)
        : db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      const available = Number(row?.stock ?? 0);

      if (available <= 0) {
        return res.status(409).json({ error: `${item.name} is out of stock` });
      }
      if (item.quantity > available) {
        return res.status(409).json({
          error: `Only ${available} left of ${item.name}. Adjust your cart and try again.`,
        });
      }
    }

    const { email, firstName, lastName, address, city, postalCode, country } = req.validated;
    const priced = priceCart(cartItems);
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;

    const insertOrder = db.prepare(`
      INSERT INTO orders
        (id, user_id, session_id, email, first_name, last_name, address, city, postal_code,
         country, subtotal, shipping, tax, total, status, payment_provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, variant_id, name, price, quantity, image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const decrementVariant = db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ?');
    const decrementProduct = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    const clearUserCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');
    const clearGuestCart = db.prepare('DELETE FROM cart_items WHERE session_id = ?');

    // All-or-nothing: header, lines, reserved stock and cart clearing.
    const placeOrder = db.transaction(() => {
      insertOrder.run(
        orderId,
        ident.userId ?? null,
        ident.sessionId ?? null,
        email, firstName, lastName, address, city, postalCode, country,
        priced.subtotal, priced.shipping, priced.tax, priced.total,
        'pending_payment',
        gateway.name
      );

      for (const item of cartItems) {
        insertItem.run(
          orderId, item.product_id, item.variant_id ?? null,
          item.name, item.price, item.quantity, item.image
        );
        if (item.variant_id) decrementVariant.run(item.quantity, item.variant_id);
        else decrementProduct.run(item.quantity, item.product_id);
      }

      if (ident.userId) clearUserCart.run(ident.userId);
      else clearGuestCart.run(ident.sessionId);
    });

    placeOrder();

    const order = loadOrder(orderId);

    // Hand the client a payment intent so the pay step stays provider-agnostic
    // (Stripe Elements will need `clientSecret` here).
    const intent = await createIntent(order);

    res.status(201).json({
      ...order,
      payment: {
        provider: gateway.name,
        intentId: intent.id,
        clientSecret: intent.clientSecret,
        amount: intent.amount,
        last4: null,
        paidAt: null,
        failureReason: null,
      },
      paymentNotice: describeProvider().notice,
    });
  } catch (err) {
    next(err);
  }
});

async function createIntent(order) {
  const intent = await gateway.createIntent({
    orderId: order.id,
    amount: order.total,
    currency: 'usd',
  });
  db.prepare('UPDATE orders SET payment_intent_id = ? WHERE id = ?').run(intent.id, order.id);
  return { id: intent.id, clientSecret: intent.clientSecret, amount: order.total, provider: gateway.name };
}

/* ------------------------------------------------------------------- pay */

/**
 * Charges a pending order.
 *
 * In demo mode the gateway simulates authorisation and honours Stripe's test
 * card numbers (4242… succeeds, 4000 0000 0000 0002 is declined). The full
 * card number is validated, used once, and thrown away — only `last4` is kept.
 */
router.post('/:id/pay', optionalAuth, validate(schemas.payOrder), async (req, res, next) => {
  try {
    const row = findOwnedOrder(req, res);
    if (!row) return undefined;

    if (row.status === 'paid') {
      return res.status(409).json({ error: 'This order has already been paid', order: loadOrder(row.id) });
    }
    if (row.status === 'cancelled') {
      return res.status(409).json({ error: 'This order was cancelled' });
    }

    const result = await gateway.confirmIntent({
      intentId: row.payment_intent_id,
      card: req.validated.card,
    });

    if (result.status !== 'succeeded') {
      db.prepare('UPDATE orders SET failure_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(result.reason ?? 'Payment declined', row.id);
      return res.status(402).json({
        error: result.reason ?? 'Payment was declined',
        order: loadOrder(row.id),
      });
    }

    db.prepare(
      `UPDATE orders
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, card_last4 = ?,
           failure_reason = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(result.last4 ?? null, row.id);

    res.json(loadOrder(row.id));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- cancel */

/** Cancels an unpaid order and returns the reserved stock. */
router.post('/:id/cancel', optionalAuth, (req, res) => {
  const row = findOwnedOrder(req, res);
  if (!row) return;

  if (!canCancel(row.status)) {
    return res.status(409).json({
      error: `Only orders awaiting payment can be cancelled (this one is ${row.status})`,
    });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);

  const cancel = db.transaction(() => {
    for (const item of items) {
      if (item.variant_id) {
        db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(
          item.quantity, item.variant_id);
      } else {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(
          item.quantity, item.product_id);
      }
    }
    db.prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(row.id);
  });
  cancel();

  res.json(loadOrder(row.id));
});

/* ----------------------------------------------------------------- read */

/** Orders belonging to the signed-in user. */
router.get('/', authMiddleware, (req, res) => {
  const orders = db
    .prepare(
      `SELECT ${ORDER_COLUMNS},
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(req.user.userId);

  res.json(
    orders.map((o) => ({
      ...toOrderDto(o),
      itemCount: o.item_count,
      items: db.prepare(ORDER_ITEM_SELECT).all(o.id).map((i) => ({
        id: i.id,
        productId: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
      })),
    }))
  );
});

/** One order — readable by its owner (the user, or the guest session that placed it). */
router.get('/:id', optionalAuth, (req, res) => {
  const row = findOwnedOrder(req, res);
  if (!row) return;
  res.json(loadOrder(row.id));
});

export default router;
