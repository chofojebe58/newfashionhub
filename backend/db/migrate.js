import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, 'migrations');

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = () => new Set(db.prepare('SELECT id FROM migrations').all().map((r) => r.id));

const pendingFiles = () => {
  const done = applied();
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .filter((f) => !done.has(f.replace(/\.js$/, '')));
};

async function runMigration(filename) {
  const mod = await import(`file://${resolve(migrationsDir, filename)}`);
  const up = mod.up ?? mod.default;
  if (typeof up !== 'function') throw new Error(`${filename} exports no up()`);

  // Each migration runs in its own transaction so a failure leaves no partial state.
  const apply = db.transaction(() => {
    up(db);
    db.prepare('INSERT INTO migrations (id) VALUES (?)').run(filename.replace(/\.js$/, ''));
  });
  apply();
  console.log(`  ✓ ${filename}`);
}

export async function runMigrations() {
  const pending = pendingFiles();
  if (!pending.length) {
    console.log('No pending migrations');
    return 0;
  }
  console.log(`Running ${pending.length} migration(s)…`);
  for (const file of pending) await runMigration(file);
  console.log('All migrations applied');
  return pending.length;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(here, 'migrate.js');
if (isDirectRun) {
  runMigrations()
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
