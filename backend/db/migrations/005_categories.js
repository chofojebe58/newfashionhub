/**
 * First-class categories.
 *
 * Until now a product's category was just a free-text column, so the public
 * category tiles and the shop's filter list could only guess at what exists.
 * This gives categories their own table — slug (for URLs), display name,
 * image, description, ordering and a published flag — so the admin can create
 * a collection before any product lives in it, and the storefront can render
 * real links to real pages.
 */
import { DEFAULT_CATEGORIES } from '../../services/categories.js';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      image       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      published   INTEGER NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_published ON categories(published);
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO categories (slug, name, description, image, sort_order, published)
    VALUES (@slug, @name, @description, @image, @sort_order, 1)
  `);

  const seed = db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((c, index) =>
      insert.run({
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        image: c.image ?? null,
        sort_order: index * 10,
      })
    );
  });
  seed();

  // Adopt whatever free-text categories products already use, so nothing that
  // was live disappears.
  const orphan = db
    .prepare(
      `SELECT DISTINCT p.category AS name
       FROM products p
       WHERE p.category IS NOT NULL AND p.category <> ''
         AND NOT EXISTS (
           SELECT 1 FROM categories c
           WHERE lower(c.name) = lower(p.category) OR c.slug = lower(p.category)
         )`
    )
    .all();

  if (orphan.length) {
    const nextOrder =
      (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get().n ?? 0) + 10;
    const add = db.prepare(
      'INSERT OR IGNORE INTO categories (slug, name, sort_order) VALUES (?, ?, ?)'
    );
    const adopt = db.transaction(() => {
      orphan.forEach((row, index) => {
        const slug = row.name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        add.run(slug || `cat-${row.id ?? index}`, row.name, nextOrder + index * 10);
      });
    });
    adopt();
  }
}

export function down(db) {
  db.exec('DROP TABLE IF EXISTS categories');
}
