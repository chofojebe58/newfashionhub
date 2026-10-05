import express from 'express';
import { db } from '../db.js';
import {
  getCartIdentifier,
  getCartItems,
  emptyCart,
  availableStock,
} from '../services/cart.js';
import { validate, schemas } from '../middleware/validate.js';

const router = express.Router();

const MISSING_IDENTITY = { error: 'A session id or auth token is required' };

router.get('/', (req, res) => {
  const ident = getCartIdentifier(req);
  if (!ident) return res.json(emptyCart());
  res.json(getCartItems(ident));
});

router.post('/', validate(schemas.cartItem), (req, res) => {
  const ident = getCartIdentifier(req);
  if (!ident) return res.status(400).json(MISSING_IDENTITY);

  const { productId, variantId, quantity } = req.validated;

  const product = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  if (variantId) {
    const variant = db
      .prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?')
      .get(variantId, productId);
    if (!variant) return res.status(404).json({ error: 'Variant not found for this product' });
  }

  const cap = availableStock(productId, variantId);
  if (cap <= 0) return res.status(409).json({ error: `${product.name} is out of stock` });

  const existing = ident.userId
    ? db
        .prepare(
          'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))'
        )
        .get(ident.userId, productId, variantId ?? null, variantId ?? null)
    : db
        .prepare(
          'SELECT * FROM cart_items WHERE session_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))'
        )
        .get(ident.sessionId, productId, variantId ?? null, variantId ?? null);

  if (existing) {
    const nextQty = Math.min(existing.quantity + quantity, cap);
    if (nextQty === existing.quantity) {
      return res
        .status(409)
        .json({ error: `Only ${cap} of ${product.name} available`, ...getCartItems(ident) });
    }
    db.prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      nextQty,
      existing.id
    );
  } else {
    if (quantity > cap) {
      return res.status(409).json({ error: `Only ${cap} of ${product.name} available` });
    }
    db.prepare(
      ident.userId
        ? 'INSERT INTO cart_items (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)'
        : 'INSERT INTO cart_items (session_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)'
    ).run(ident.userId ?? ident.sessionId, productId, variantId ?? null, quantity);
  }

  res.status(201).json(getCartItems(ident));
});

router.patch('/:itemId', validate(schemas.cartQuantity), (req, res) => {
  const ident = getCartIdentifier(req);
  if (!ident) return res.status(400).json(MISSING_IDENTITY);

  const item = ident.userId
    ? db
        .prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?')
        .get(req.params.itemId, ident.userId)
    : db
        .prepare('SELECT * FROM cart_items WHERE id = ? AND session_id = ?')
        .get(req.params.itemId, ident.sessionId);

  if (!item) return res.status(404).json({ error: 'Cart item not found' });

  const { quantity } = req.validated;

  if (quantity === 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    return res.json(getCartItems(ident));
  }

  const cap = availableStock(item.product_id, item.variant_id);
  if (cap <= 0) {
    return res.status(409).json({ error: 'This item is out of stock', ...getCartItems(ident) });
  }

  const nextQty = Math.min(quantity, cap);
  db.prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    nextQty,
    item.id
  );

  res.json(getCartItems(ident));
});

router.delete('/:itemId', (req, res) => {
  const ident = getCartIdentifier(req);
  if (!ident) return res.status(400).json(MISSING_IDENTITY);

  const result = ident.userId
    ? db
        .prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?')
        .run(req.params.itemId, ident.userId)
    : db
        .prepare('DELETE FROM cart_items WHERE id = ? AND session_id = ?')
        .run(req.params.itemId, ident.sessionId);

  if (result.changes === 0) return res.status(404).json({ error: 'Cart item not found' });
  res.status(204).send();
});

router.delete('/', (req, res) => {
  const ident = getCartIdentifier(req);
  if (!ident) return res.status(400).json(MISSING_IDENTITY);

  ident.userId
    ? db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(ident.userId)
    : db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(ident.sessionId);

  res.status(204).send();
});

export default router;
