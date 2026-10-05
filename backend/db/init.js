/**
 * Creates/upgrades the database schema.
 *
 * Thin wrapper around the migration runner so the schema is defined in exactly
 * one place (db/migrations/*). `npm run db:init` and `npm run db:migrate`
 * therefore do the same thing.
 */
import { db } from '../db.js';
import { runMigrations } from './migrate.js';

runMigrations()
  .then(() => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => r.name);
    console.log(`✓ Database ready at ${db.name}`);
    console.log(`  tables: ${tables.join(', ')}`);
  })
  .catch((err) => {
    console.error('Initialisation failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
