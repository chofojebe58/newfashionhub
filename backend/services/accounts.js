import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { signToken } from '../middleware/auth.js';

/**
 * ACCOUNTS — the single home for everything about who can sign in and what
 * they are allowed to do, including the admin bootstrap.
 *
 * Before this module existed, account logic was spread across routes/auth.js,
 * routes/admin.js and middleware/auth.js. Routes now stay thin: they validate
 * input, call into here, and shape the response.
 *
 *   createUser()        register (customer or admin)
 *   authenticate()      email + password → session token
 *   findById()          public profile
 *   updateProfile()     first / last name
 *   changePassword()    current-password-checked rotation, re-issues token
 *   listUsers()         admin view (never includes password hashes)
 *   setRole()           promote / demote, with a self-lockout guard
 *   adminAccessState()  what the admin gate is allowed to offer right now
 *   createAdmin()       the browser bootstrap: first run or setup key
 */

const PUBLIC_FIELDS = 'id, email, first_name, last_name, role, created_at';

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role || 'customer',
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ reads */

export function findById(id) {
  return toPublicUser(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id));
}

export function findByEmail(email) {
  return db
    .prepare(`SELECT ${PUBLIC_FIELDS}, password_hash FROM users WHERE email = ?`)
    .get(String(email).trim().toLowerCase());
}

export function countAdmins() {
  return db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
}

/** Admin listing. Selects only public columns — hashes never leave here. */
export function listUsers() {
  return db
    .prepare(
      `SELECT id, email, first_name, last_name, role, created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = users.id) AS order_count
       FROM users
       ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at DESC`
    )
    .all()
    .map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role || 'customer',
      createdAt: u.created_at,
      orderCount: u.order_count,
    }));
}

/* ----------------------------------------------------------------- writes */

export function createUser({ email, password, firstName = '', lastName = '', role = 'customer' }) {
  const cleanEmail = String(email).trim().toLowerCase();

  if (findByEmail(cleanEmail)) {
    const err = new Error('Email already registered');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare(
      'INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)'
    )
    .run(cleanEmail, passwordHash, firstName, lastName, role);

  return findById(info.lastInsertRowid);
}

export function verifyPassword(userRowWithHash, password) {
  return bcrypt.compareSync(String(password), userRowWithHash.password_hash);
}

/** Email + password → { token, user }. Throws AUTH_FAILED on any mismatch. */
export function authenticate(email, password) {
  const row = findByEmail(email);
  // Same message for unknown email and wrong password: no account enumeration.
  if (!row || !verifyPassword(row, password)) {
    const err = new Error('Invalid email or password');
    err.code = 'AUTH_FAILED';
    throw err;
  }
  const user = toPublicUser(row);
  return { token: signToken(user), user };
}

export function updateProfile(id, { firstName, lastName }) {
  const fields = [];
  const values = [];
  if (firstName !== undefined) {
    fields.push('first_name = ?');
    values.push(firstName);
  }
  if (lastName !== undefined) {
    fields.push('last_name = ?');
    values.push(lastName);
  }
  if (!fields.length) return findById(id);

  db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
    ...values,
    id
  );
  return findById(id);
}

/** Verifies the current password, rotates it, and returns a fresh token. */
export function changePassword(id, currentPassword, newPassword) {
  const row = db
    .prepare(`SELECT ${PUBLIC_FIELDS}, password_hash FROM users WHERE id = ?`)
    .get(id);
  if (!row) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!verifyPassword(row, currentPassword)) {
    const err = new Error('Your current password is incorrect');
    err.code = 'WRONG_PASSWORD';
    throw err;
  }
  if (currentPassword === newPassword) {
    const err = new Error('Choose a password you have not used before');
    err.code = 'PASSWORD_REUSED';
    throw err;
  }

  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    id
  );

  const user = findById(id);
  return { user, token: signToken(user) };
}

/**
 * Promote or demote. Refuses to strip the caller's own admin role — that is
 * how a store locks itself out of its own back office.
 */
export function setRole(id, role, actorId) {
  if (Number(id) === Number(actorId) && role !== 'admin') {
    const err = new Error('You cannot remove your own admin access. Ask another admin to do it.');
    err.code = 'SELF_LOCKOUT';
    throw err;
  }

  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
  if (!target) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  return { id: target.id, email: target.email, role };
}

/* ------------------------------------------------------- admin bootstrap */

function setupKeyMatches(provided) {
  const expected = config.adminSetupKey;
  if (!expected) return false;
  const a = Buffer.from(String(provided ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What the admin gate may offer right now. Never reveals how many admins
 * exist beyond the first-run flag the UX needs.
 */
export function adminAccessState() {
  const firstRun = countAdmins() === 0;
  const keyConfigured = Boolean(config.adminSetupKey);
  return {
    canCreateAdmin: firstRun || keyConfigured,
    requiresSetupKey: keyConfigured,
    firstRun,
  };
}

/**
 * Creates (or promotes) an admin from the browser.
 *
 * Allowed when either no admin exists yet (first-run bootstrap) or the caller
 * presents the ADMIN_SETUP_KEY. If a key is configured it is always required.
 * Supplying an existing account's email promotes that account, but only when
 * the submitted password matches — so this cannot hijack anybody.
 */
export function createAdmin({ email, password, firstName = '', lastName = '', setupKey }) {
  const state = adminAccessState();
  const keyConfigured = Boolean(config.adminSetupKey);

  if (keyConfigured) {
    if (!setupKeyMatches(setupKey)) {
      const err = new Error('That setup key is not correct.');
      err.code = 'BAD_SETUP_KEY';
      throw err;
    }
  } else if (!state.firstRun) {
    const err = new Error(
      'Admin sign-up is closed because an admin already exists. Ask an existing admin to promote your account, or set ADMIN_SETUP_KEY in backend/.env.'
    );
    err.code = 'ADMIN_SIGNUP_CLOSED';
    throw err;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = findByEmail(cleanEmail);

  if (existing) {
    if (!verifyPassword(existing, password)) {
      const err = new Error('Email already registered');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
    db.prepare(`UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      existing.id
    );
    const user = findById(existing.id);
    return { user, token: signToken(user), promotedExisting: true };
  }

  const user = createUser({ email: cleanEmail, password, firstName, lastName, role: 'admin' });
  return { user, token: signToken(user), promotedExisting: false };
}

export { toPublicUser, signToken };
