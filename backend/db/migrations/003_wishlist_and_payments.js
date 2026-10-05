/**
 * Two additions:
 *
 * 1. A server-side wishlist so it can follow a user across devices.
 * 2. Payment lifecycle columns on `orders`, so an order can sit in
 *    `pending_payment` and only become `paid` once a gateway confirms it.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist (
      user_id    INTEGER NOT NULL,
      product_id TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, product_id),
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
  `);

  const columns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  const add = (name, ddl) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${ddl}`);
  };

  add('payment_provider', 'TEXT');
  add('paid_at', 'DATETIME');
  add('card_last4', 'TEXT');
  add('failure_reason', 'TEXT');
}

export function down(db) {
  db.exec('DROP TABLE IF EXISTS wishlist');
}
