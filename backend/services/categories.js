import { db } from '../db.js';

/**
 * Categories: the single place that knows how they are stored, slugified,
 * resolved from a URL and counted.
 *
 * Seeded on first run (migration 005) and editable from the admin panel. The
 * storefront renders its tiles and filter list from `listCategories()`, so
 * anything created here appears publicly without a code change.
 */
export const DEFAULT_CATEGORIES = [
  {
    slug: 'women',
    name: 'Women',
    description: 'Tailored staples and everyday ease.',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'men',
    name: 'Men',
    description: 'Sharp, relaxed and built to layer.',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'dresses',
    name: 'Dresses',
    description: 'From desk to dinner without a change.',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'tops',
    name: 'Tops',
    description: 'Knits, shirts and second-skin layers.',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'shoes',
    name: 'Shoes',
    description: 'Heels, loafers and everything between.',
    image: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'bags',
    name: 'Bags',
    description: 'Structured companions for every day.',
    image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=80',
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'The finishing touches.',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=500&q=80',
  },
];

/** `Linen Blend Blazer` → `linen-blend-blazer`. Also used for product slugs. */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM products p
      WHERE p.published = 1
        AND p.category IS NOT NULL
        AND (lower(p.category) = lower(c.name) OR lower(p.category) = c.slug)) AS product_count
  FROM categories c
`;

function serialize(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    image: row.image ?? '',
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    productCount: Number(row.product_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Public list: published only, in the order the admin chose. */
export function listPublicCategories() {
  return db
    .prepare(`${SELECT} WHERE c.published = 1 ORDER BY c.sort_order, c.name`)
    .all()
    .map(serialize);
}

/** Admin list: everything, including hidden categories. */
export function listAllCategories() {
  return db.prepare(`${SELECT} ORDER BY c.sort_order, c.name`).all().map(serialize);
}

export function getCategory(idOrSlug) {
  const row = db
    .prepare(`${SELECT} WHERE c.id = ? OR c.slug = ?`)
    .get(Number.isInteger(Number(idOrSlug)) ? Number(idOrSlug) : -1, String(idOrSlug));
  return row ? serialize(row) : null;
}

/**
 * Resolves a `?category=` query value (slug OR display name, any case) to the
 * product-category string the products table actually uses. Falls back to the
 * raw value so free-text categories still filter.
 */
export function resolveCategoryFilter(value) {
  if (!value) return null;
  const row = db
    .prepare('SELECT name FROM categories WHERE slug = ? OR lower(name) = lower(?)')
    .get(slugify(value), value);
  return row ? row.name : value;
}

/** Creates the category if a product is saved under a name that doesn't exist yet. */
export function ensureCategory(name) {
  const clean = String(name ?? '').trim();
  if (!clean) return null;

  const existing = db
    .prepare('SELECT id FROM categories WHERE lower(name) = lower(?) OR slug = ?')
    .get(clean, slugify(clean));
  if (existing) return getCategory(existing.id);

  const nextOrder =
    (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get().n ?? 0) + 10;

  let slug = slugify(clean) || `cat-${Date.now().toString(36)}`;
  if (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const info = db
    .prepare('INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)')
    .run(slug, clean, nextOrder);

  return getCategory(info.lastInsertRowid);
}

export const createCategory = db.transaction((input) => {
  const name = String(input.name).trim();
  let slug = input.slug ? slugify(input.slug) : slugify(name);
  if (!slug) slug = `cat-${Date.now().toString(36)}`;

  if (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
    const err = new Error(`A category with the slug "${slug}" already exists`);
    err.code = 'CATEGORY_SLUG_TAKEN';
    throw err;
  }
  if (db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(name)) {
    const err = new Error(`A category named "${name}" already exists`);
    err.code = 'CATEGORY_NAME_TAKEN';
    throw err;
  }

  const nextOrder =
    input.sortOrder ??
    (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get().n ?? 0) + 10;

  const info = db
    .prepare(
      `INSERT INTO categories (slug, name, description, image, sort_order, published)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug,
      name,
      input.description?.trim() || null,
      input.image?.trim() || null,
      Number.isFinite(Number(input.sortOrder)) && input.sortOrder !== undefined
        ? Number(input.sortOrder)
        : nextOrder,
      input.published === false ? 0 : 1
    );

  return getCategory(info.lastInsertRowid);
});

export const updateCategory = db.transaction((id, patch) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return null;

  const name = patch.name !== undefined ? String(patch.name).trim() : existing.name;
  let slug = existing.slug;
  if (patch.slug !== undefined && patch.slug !== '') {
    slug = slugify(patch.slug);
    const clash = db.prepare('SELECT id FROM categories WHERE slug = ? AND id <> ?').get(slug, id);
    if (clash) {
      const err = new Error(`A category with the slug "${slug}" already exists`);
      err.code = 'CATEGORY_SLUG_TAKEN';
      throw err;
    }
  }

  db.prepare(
    `UPDATE categories SET
       slug = ?, name = ?,
       description = ?, image = ?,
       sort_order = ?, published = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    slug,
    name,
    patch.description !== undefined ? patch.description.trim() || null : existing.description,
    patch.image !== undefined ? patch.image.trim() || null : existing.image,
    patch.sortOrder !== undefined ? Number(patch.sortOrder) : existing.sort_order,
    patch.published !== undefined ? (patch.published ? 1 : 0) : existing.published,
    id
  );

  // Keep products in step when a category is renamed.
  if (name !== existing.name) {
    db.prepare('UPDATE products SET category = ? WHERE lower(category) = lower(?)').run(
      name,
      existing.name
    );
  }

  return getCategory(id);
});

export function deleteCategory(id) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return { deleted: false, reason: 'not-found' };

  const used = db
    .prepare('SELECT COUNT(*) AS n FROM products WHERE lower(category) = lower(?)')
    .get(existing.name).n;
  if (used > 0) {
    return { deleted: false, reason: 'in-use', productCount: used };
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { deleted: true };
}
