import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

function list(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 3001,

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // 'demo' simulates a gateway (no money moves); 'stripe' needs STRIPE_SECRET_KEY.
  paymentProvider: (process.env.PAYMENT_PROVIDER || 'demo').toLowerCase(),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:5173,http://localhost:3000'),

  // Bootstrap address for the first admin account (see db/promote-admin.js)
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),

  /**
   * Optional shared secret that unlocks admin registration from the browser.
   *
   * When it is NOT set, the very first account created while the users table
   * has no admins becomes an admin (first-run bootstrap). After that, only an
   * existing admin can promote anyone — unless this key is configured, in which
   * case the key is always required.
   */
  adminSetupKey: process.env.ADMIN_SETUP_KEY || '',

  // Pending migrations are applied on boot so a fresh clone just works.
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',

  dbPath: process.env.DB_PATH ? resolve(here, process.env.DB_PATH) : resolve(here, 'fashionhub.db'),

  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '100kb',

  // Rate limiting (raise these for integration test runs)
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT) || 100,
  authRateWindowMs: Number(process.env.AUTH_RATE_WINDOW_MS) || 15 * 60 * 1000,
};
