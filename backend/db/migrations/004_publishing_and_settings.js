import { DEFAULT_SETTINGS } from '../../services/settings.js';

/**
 * Gives the admin panel control over the public site:
 *
 *   products.published  – hidden products never reach the storefront
 *   products.featured   – drives the homepage "Most Loved Picks" grid
 *   products.gallery    – extra images beyond the main one (JSON array)
 *   site_settings       – editable homepage / footer copy
 */
export function up(db) {
  const columns = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  const add = (name, ddl) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${ddl}`);
  };

  add('published', 'INTEGER NOT NULL DEFAULT 1');
  add('featured', 'INTEGER NOT NULL DEFAULT 0');
  add('gallery', 'TEXT');

  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_published ON products(published)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      setting_key   TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL DEFAULT '',
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)'
  );
  const seedDefaults = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value);
  });
  seedDefaults();

  // Mark the three products the homepage already showcased as featured.
  db.prepare(
    `UPDATE products SET featured = 1
     WHERE id IN ('linen-blend-blazer', 'ribbed-knit-top', 'wide-leg-trousers')`
  ).run();
}

export function down(db) {
  db.exec('DROP TABLE IF EXISTS site_settings');
}
