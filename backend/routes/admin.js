import express from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';
import { validate, schemas } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { ORDER_STATUSES } from '../services/orderStatus.js';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  getSettings,
  updateSettings,
} from '../services/settings.js';
import {
  createCategory,
  deleteCategory,
  ensureCategory,
  getCategory,
  listAllCategories,
  updateCategory,
} from '../services/categories.js';
import { listUsers, setRole } from '../services/accounts.js';

const here = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolve(here, '../uploads');

const router = express.Router();

// Every admin route requires a valid JWT whose user has role = 'admin'.
// Promote an account with: npm run db:promote -- you@example.com
router.use(requireAdmin);

router.get('/orders', (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all();
  res.json(orders);
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }

  const result = db
    .prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  res.json(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id));
});

router.get('/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC, name ASC').all();
  res.json(products.map(deserialize));
});

router.get('/subscribers', (req, res) => {
  res.json(db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all());
});

router.get('/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get();
  res.json({
    products: one('SELECT COUNT(*) AS n FROM products').n,
    published: one('SELECT COUNT(*) AS n FROM products WHERE published = 1').n,
    hidden: one('SELECT COUNT(*) AS n FROM products WHERE published = 0').n,
    featured: one('SELECT COUNT(*) AS n FROM products WHERE featured = 1').n,
    variants: one('SELECT COUNT(*) AS n FROM product_variants').n,
    orders: one('SELECT COUNT(*) AS n FROM orders').n,
    customers: one('SELECT COUNT(*) AS n FROM users').n,
    subscribers: one('SELECT COUNT(*) AS n FROM subscribers').n,
    revenue: one(
      `SELECT COALESCE(SUM(total), 0) AS n FROM orders
       WHERE status IN ('paid', 'shipped', 'delivered')`
    ).n,
    awaitingPayment: one(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending_payment'`).n,
    lowStock: db
      .prepare('SELECT id, name, stock FROM products WHERE stock <= 5 ORDER BY stock ASC')
      .all(),
  });
});

/**
 * Create or update a product.
 *
 * Deliberately NOT `INSERT OR REPLACE`: that deletes the row first and would
 * silently wipe `rating`, `reviews`, `created_at` and any column not listed.
 *
 * Updates are partial — only the keys present in the request body are written,
 * so `POST {id, name, price}` renames a product without clearing its category.
 * Send an explicit `null` to clear an optional field.
 */
const PRODUCT_COLUMNS = {
  name: (v) => v,
  price: (v) => v,
  old_price: (v) => v ?? null,
  image: (v) => v ?? null,
  description: (v) => v ?? null,
  features: (v) => JSON.stringify(v ?? []),
  rating: (v) => v ?? null,
  reviews: (v) => v ?? null,
  category: (v) => v ?? null,
  stock: (v) => v ?? 0,
  gallery: (v) => JSON.stringify(v ?? []),
  published: (v) => (v === undefined ? 1 : v ? 1 : 0),
  featured: (v) => (v ? 1 : 0),
};

router.post('/products', validate(schemas.product), (req, res) => {
  const p = req.validated;
  const sentKeys = new Set(Object.keys(req.body ?? {}));

  // A product saved under a brand-new category brings that category to life on
  // the public site too, so "add a product in a new collection" just works.
  let createdCategory = null;
  if (p.category) createdCategory = ensureCategory(p.category);

  const existing = db.prepare('SELECT id, created_at FROM products WHERE id = ?').get(p.id);

  // Creating needs the essentials; updating only needs the keys you send.
  if (!existing) {
    const missing = [];
    if (!p.name) missing.push('name');
    if (p.price === undefined) missing.push('price');
    if (missing.length) {
      return res.status(400).json({
        error: `A new product needs ${missing.join(' and ')}`,
      });
    }
  }

  if (existing) {
    const assignments = Object.keys(PRODUCT_COLUMNS)
      .filter((column) => sentKeys.has(column))
      .map((column) => `${column} = ?`);

    if (assignments.length === 0) {
      return res.status(400).json({ error: 'No updatable fields were provided' });
    }

    const values = Object.keys(PRODUCT_COLUMNS)
      .filter((column) => sentKeys.has(column))
      .map((column) => PRODUCT_COLUMNS[column](p[column]));

    db.prepare(
      `UPDATE products SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...values, p.id);
  } else {
    db.prepare(
      `INSERT INTO products
         (id, name, price, old_price, image, description, features, rating, reviews,
          category, stock, gallery, published, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.id,
      p.name,
      p.price,
      p.old_price ?? null,
      p.image ?? null,
      p.description ?? null,
      JSON.stringify(p.features ?? []),
      p.rating ?? null,
      p.reviews ?? null,
      p.category ?? null,
      p.stock ?? 0,
      JSON.stringify(p.gallery ?? []),
      p.published ? 1 : 0,
      p.featured ? 1 : 0
    );
  }

  const saved = deserialize(db.prepare('SELECT * FROM products WHERE id = ?').get(p.id));
  res.status(existing ? 200 : 201).json({
    ...saved,
    ...(createdCategory ? { categoryCreated: createdCategory } : {}),
  });
});

router.delete('/products/:id', (req, res) => {
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const ordered = db
    .prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?')
    .get(product.id).n;

  // order_items.product_id is ON DELETE RESTRICT — past orders must keep their history.
  if (ordered > 0) {
    return res.status(409).json({
      error: `"${product.name}" appears in ${ordered} order(s) and cannot be deleted. Set its stock to 0 to hide it instead.`,
    });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  res.status(204).send();
});

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deserialize(row) {
  return {
    ...row,
    features: parseJsonArray(row.features),
    gallery: parseJsonArray(row.gallery),
    published: Boolean(row.published),
    featured: Boolean(row.featured),
  };
}

/* ------------------------------------------------------------ the team */

/** Lists every account. services/accounts.js never selects password hashes. */
router.get('/users', (req, res) => {
  res.json(listUsers());
});

/**
 * Promotes or demotes an account.
 *
 * You cannot remove your own admin role — that is how a store locks itself out
 * of its own back office.
 */
router.patch('/users/:id/role', validate(schemas.userRole), (req, res, next) => {
  const targetId = Number(req.params.id);
  if (Number.isNaN(targetId)) {
    return res.status(400).json({ error: 'A numeric user id is required' });
  }

  try {
    const updated = setRole(targetId, req.validated.role, req.user.userId);
    res.json({
      ...updated,
      message:
        updated.role === 'admin'
          ? `${updated.email} can now sign in to the admin panel.`
          : `${updated.email} no longer has admin access.`,
    });
  } catch (err) {
    if (err.code === 'SELF_LOCKOUT') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    next(err);
  }
});

/* ----------------------------------------------------------- categories */

router.get('/categories', (req, res) => {
  res.json(listAllCategories());
});

router.post('/categories', validate(schemas.category), (req, res, next) => {
  try {
    res.status(201).json(createCategory(req.validated));
  } catch (err) {
    if (err.code === 'CATEGORY_SLUG_TAKEN' || err.code === 'CATEGORY_NAME_TAKEN') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

router.patch('/categories/:id', validate(schemas.categoryUpdate), (req, res, next) => {
  try {
    const updated = updateCategory(Number(req.params.id), req.validated);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    res.json(updated);
  } catch (err) {
    if (err.code === 'CATEGORY_SLUG_TAKEN') return res.status(409).json({ error: err.message });
    next(err);
  }
});

/**
 * Deletes a category. Refuses while any product still uses it — those
 * products would otherwise be orphaned from every collection page.
 */
router.delete('/categories/:id', (req, res) => {
  const result = deleteCategory(Number(req.params.id));

  if (!result.deleted) {
    if (result.reason === 'not-found') return res.status(404).json({ error: 'Category not found' });
    return res.status(409).json({
      error: `"${getCategory(req.params.id)?.name ?? 'This category'}" still has ${
        result.productCount
      } product(s). Move or delete them first, or hide the category instead.`,
    });
  }

  res.status(204).send();
});

/* ------------------------------------------------------- site settings */

router.get('/settings', (req, res) => {
  res.json({ settings: getSettings(), keys: SETTING_KEYS });
});

/**
 * Edits the copy on the public pages. Only known keys are accepted; unknown
 * ones are reported back rather than silently ignored.
 */
router.put('/settings', validate(schemas.settings), (req, res) => {
  const { applied, rejected } = updateSettings(req.validated);
  res.json({ settings: getSettings(), applied, rejected });
});

router.post('/settings/reset', (req, res) => {
  const keys = Array.isArray(req.body?.keys) && req.body.keys.length
    ? req.body.keys.filter((k) => SETTING_KEYS.includes(String(k)))
    : SETTING_KEYS;

  updateSettings(Object.fromEntries(keys.map((k) => [k, DEFAULT_SETTINGS[k]])));
  res.json({ settings: getSettings(), reset: keys });
});

/* ------------------------------------------------------------ variants */

/**
 * Replaces a product's variant set from a size × colour matrix.
 *
 * Existing (size, colour) pairs are updated in place so cart and order lines
 * keep pointing at a real variant; genuinely new pairs are inserted; pairs that
 * disappeared are removed.
 */
router.put('/products/:id/variants', validate(schemas.variantSet), (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const incoming = req.validated.variants;

  // Duplicate size+colour pairs would create two indistinguishable options.
  const seen = new Set();
  for (const v of incoming) {
    const key = `${v.size.toLowerCase()}|${v.color.toLowerCase()}`;
    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate variant: ${v.size} / ${v.color}` });
    }
    seen.add(key);
  }

  const skuCode = (value) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'XXX';
  const prefix = product.id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3);

  const existing = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ?')
    .all(product.id);
  const existingByKey = new Map(
    existing.map((row) => [`${String(row.size).toLowerCase()}|${String(row.color).toLowerCase()}`, row])
  );

  const insert = db.prepare(
    'INSERT INTO product_variants (product_id, size, color, sku, stock) VALUES (?, ?, ?, ?, ?)'
  );
  const update = db.prepare('UPDATE product_variants SET stock = ?, sku = COALESCE(?, sku) WHERE id = ?');
  const remove = db.prepare('DELETE FROM product_variants WHERE id = ?');

  const apply = db.transaction(() => {
    const keep = new Set();
    let inserted = 0;
    let updated = 0;

    for (const variant of incoming) {
      const key = `${variant.size.toLowerCase()}|${variant.color.toLowerCase()}`;
      const sku = variant.sku || `${prefix}-${skuCode(variant.color)}-${skuCode(variant.size)}`;
      const row = existingByKey.get(key);

      if (row) {
        update.run(variant.stock, sku, row.id);
        keep.add(row.id);
        updated += 1;
      } else {
        // A SKU collision with another product must not fail the whole save.
        const clash = db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(sku);
        insert.run(product.id, variant.size, variant.color, clash ? `${sku}-${randomBytes(2).toString('hex')}` : sku, variant.stock);
        inserted += 1;
      }
    }

    let removed = 0;
    for (const row of existing) {
      if (keep.has(row.id)) continue;
      remove.run(row.id);
      removed += 1;
    }

    return { inserted, updated, removed };
  });

  const counts = apply();
  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color')
    .all(product.id);

  res.json({ variants, ...counts });
});

/* ------------------------------------------------------------- uploads */

const UPLOAD_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};
const UPLOAD_LIMIT = 5 * 1024 * 1024;

/**
 * Stores a product image on disk and returns its public URL.
 *
 * Deliberately not SVG: an uploaded SVG can carry script, which would defeat
 * the CSP everywhere it is rendered.
 */
router.post(
  '/uploads',
  express.raw({ type: Object.keys(UPLOAD_TYPES), limit: UPLOAD_LIMIT }),
  (req, res) => {
    const type = req.get('content-type') ?? '';
    const extension = UPLOAD_TYPES[type];

    if (!extension) {
      return res.status(415).json({
        error: `Unsupported image type. Allowed: ${Object.keys(UPLOAD_TYPES).join(', ')}`,
      });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'No image data received' });
    }

    try {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const filename = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}${extension}`;
      writeFileSync(resolve(UPLOAD_DIR, filename), req.body);
      res.status(201).json({ url: `/uploads/${filename}`, bytes: req.body.length });
    } catch (err) {
      console.error('Upload failed:', err);
      res.status(500).json({ error: 'Could not save the image' });
    }
  }
);

export default router;
