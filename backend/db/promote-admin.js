import { db } from '../db.js';

const email = (process.argv[2] || '').trim().toLowerCase();

if (!email) {
  console.error('Usage: npm run db:promote -- you@example.com');
  process.exit(1);
}

const user = db.prepare('SELECT id, email, role FROM users WHERE lower(email) = ?').get(email);

if (!user) {
  console.error(`No user found with email "${email}". Register first, then re-run this command.`);
  process.exit(1);
}

db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', user.id);
console.log(`✓ ${user.email} (id ${user.id}) is now an admin.`);
