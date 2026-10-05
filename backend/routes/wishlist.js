import express from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = express.Router();

// A server-side wishlist only makes sense for a signed-in user. Guests keep
// theirs in localStorage (see frontend/src/features/user/Wishlist.ts).
router.use(authMiddleware);

function listFor(userId) {
  return db
    .prepare(
      `SELECT w.product_id AS productId, w.created_at AS addedAt,
              p.name, p.price, p.image, p.stock
       FROM wishlist w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(userId);
}

router.get('/', (req, res) => {
  res.json({ items: listFor(req.user.userId) });
});

router.post('/', validate(schemas.wishlistAdd), (req, res) => {
  const { productId } = req.validated;

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  db.prepare('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)').run(
    req.user.userId,
    productId
  );

  res.status(201).json({ items: listFor(req.user.userId) });
});

router.delete('/:productId', (req, res) => {
  const result = db
    .prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?')
    .run(req.user.userId, req.params.productId);

  if (result.changes === 0) return res.status(404).json({ error: 'Not in your wishlist' });
  res.json({ items: listFor(req.user.userId) });
});

/** Bulk replace — used to push a guest's localStorage list up on first login. */
router.put('/', (req, res) => {
  const raw = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
  const ids = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))].slice(0, 200);

  const exists = db.prepare('SELECT id FROM products WHERE id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)');

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM wishlist WHERE user_id = ?').run(req.user.userId);
    let saved = 0;
    for (const id of ids) {
      if (!exists.get(id)) continue;
      insert.run(req.user.userId, id);
      saved += 1;
    }
    return saved;
  });

  const saved = replace();
  res.json({ items: listFor(req.user.userId), saved });
});

export default router;
