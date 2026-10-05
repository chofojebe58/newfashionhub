import { db } from '../db.js';

const email = (process.argv[2] || '').trim().toLowerCase();

if (!email) {
  console.error('Usage: npm run db:demote -- you@example.com');
  process.exit(1);
}

const info = db.prepare('UPDATE users SET role = ? WHERE lower(email) = ?').run('customer', email);

if (info.changes === 0) {
  console.error(`No user found with email "${email}".`);
  process.exit(1);
}
console.log(`✓ ${email} is no longer an admin.`);
