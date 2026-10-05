/**
 * Adds role-based access control so /api/admin/* can be protected.
 *
 * Existing rows default to 'customer'. Promote an account with:
 *   npm run db:promote -- you@example.com
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);

  if (!columns.includes('role')) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
}

export function down(db) {
  db.exec(`DROP INDEX IF EXISTS idx_users_role`);
  // SQLite cannot drop columns before 3.35; leave the column in place.
}
