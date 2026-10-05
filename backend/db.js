import Database from 'better-sqlite3';
import { config } from './config.js';

/**
 * Single shared database handle.
 *
 * Lives in its own module (rather than server.js) so routes, middleware and
 * services can import it without creating a circular dependency.
 */
export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
