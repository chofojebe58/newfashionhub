import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { db } from './db.js';
import { runMigrations } from './db/migrate.js';
import { catalogueIsEmpty, runSeed } from './db/seed.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import wishlistRoutes from './routes/wishlist.js';
import subscriberRoutes from './routes/subscribers.js';
import settingsRoutes from './routes/settings.js';
import categoryRoutes from './routes/categories.js';
import adminRoutes from './routes/admin.js';
import { optionalAuth } from './middleware/auth.js';
import { describeProvider } from './services/payments.js';
import { PRICING } from './services/pricing.js';

const here = dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    // Images are hot-linked from Unsplash for now; tighten this once assets are
    // self-hosted (see FIXPLAN.md → Phase 6).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://i.pinimg.com'],
        connectSrc: ["'self'", ...(config.env === 'development' ? ['ws:', 'http://localhost:5173'] : [])],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: config.jsonBodyLimit }));

// --- Rate limiting -----------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: config.authRateWindowMs,
  limit: config.authRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/auth', authLimiter);

// --- Routes ------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', optionalAuth, cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

/**
 * Public, non-secret storefront configuration.
 * The checkout page reads this so it can label the payment flow honestly.
 */
app.get('/api/store-config', (req, res) => {
  res.json({ payment: describeProvider(), pricing: PRICING });
});

// --- Uploaded product images -------------------------------------------------
const uploadDir = resolve(here, 'uploads');
mkdirSync(uploadDir, { recursive: true });
app.use(
  '/uploads',
  express.static(uploadDir, {
    maxAge: '7d',
    // Never let an upload be interpreted as anything but an image.
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:");
    },
  })
);

// --- Optional static hosting of the built frontend ---------------------------
// Set SERVE_STATIC=true to let Express serve frontend/dist (single-origin deploy).
const distDir = resolve(here, '../frontend/dist');
if (process.env.SERVE_STATIC === 'true' && existsSync(distDir)) {
  app.use(express.static(distDir, { extensions: ['html'] }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(resolve(distDir, 'index.html')));
  console.log(`Serving static frontend from ${distDir}`);
}

// --- 404 + error handling ----------------------------------------------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Validation failed', errors: err.flatten() });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Apply any pending migrations before accepting traffic.
 *
 * This is what makes a fresh clone work with just `npm run dev` — previously a
 * missing `npm run db:migrate` left the schema behind and the admin panel could
 * not function at all. Set AUTO_MIGRATE=false to opt out (e.g. when a separate
 * release step owns the schema).
 */
async function start() {
  if (config.autoMigrate) {
    try {
      await runMigrations();
    } catch (err) {
      console.error('Migration failed on boot — refusing to start:', err);
      process.exit(1);
    }
  }

  // A fresh install should show a working storefront, not an empty one.
  // Never auto-seeds in production — set AUTO_SEED=true to override.
  const shouldSeed =
    process.env.AUTO_SEED === 'true' || (!config.isProd && process.env.AUTO_SEED !== 'false');
  if (shouldSeed) {
    try {
      if (catalogueIsEmpty()) {
        const counts = runSeed();
        console.log(
          `✓ Seeded the demo catalogue (${counts.products} products, ${counts.variants} variants)`
        );
      }
    } catch (err) {
      console.error('Seeding failed:', err);
    }
  }

  const server = app.listen(config.port, () => {
  console.log(`✓ FashionHub API on http://localhost:${config.port} (${config.env})`);
  console.log(`✓ Database: ${config.dbPath}`);
    console.log(
      config.paymentProvider === 'stripe'
        ? '✓ Payments: Stripe'
        : '✓ Payments: DEMO gateway — card numbers are simulated and nothing is charged.'
    );

    const admins = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
    console.log(
      admins > 0
        ? `✓ Admin accounts: ${admins}`
        : '! No admin account yet — open /admin.html and create the first one.'
    );
  });

  function shutdown(signal) {
    console.log(`\n${signal} received, shutting down…`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

const server = await start();

export { app, db, server };
