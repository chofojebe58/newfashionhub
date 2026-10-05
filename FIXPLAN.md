# FashionHub — Fix & Improve Plan

Living checklist. ✅ done · ⬜ todo · ⏸ blocked on a decision

**Phases 1–5 are complete and verified:**

`tsc` clean · ESLint clean (0 warnings) · Vite build clean (8 pages) · **79 frontend unit
tests** pass · **84 API integration tests** pass against a live server · two end-to-end smoke
tests pass through the real Vite proxy: **45 checks** for the storefront (pages, module graph,
accounts, wishlist, cart merge, checkout, decline-and-retry payment, cancel/restock, security
guards) and **40 checks** for the admin panel (stats, homepage copy, publishing, featured
grid, variants, image upload, orders, subscribers). Plus **18 first-run bootstrap checks**
and **15 setup-key checks** against a fresh database.

---

## Phase 1 — Blockers, security, repo hygiene  ✅

### Repo hygiene
- [x] `.gitignore` (node_modules, dist, `*.db` + WAL/SHM, `.env`, logs, editor files)
- [x] Root `package.json` + `scripts/dev.mjs` → `npm run dev` starts both tiers (zero new deps)
- [x] `README.md` — setup, env table, architecture, API reference, design decisions
- [x] `backend/.env.example`
- [x] Removed the empty stub root `package-lock.json`
- [ ] ⏸ **Untrack what `.gitignore` now covers** — needs your OK (see the git question below)

### Backend breakers
- [x] `db/seed.js` — SyntaxError from the split image URL; rewritten to be idempotent
- [x] `GET /api/auth/me` — was 500ing (no `authMiddleware`); now 401/200 correctly
- [x] `/api/admin/*` — was **completely unauthenticated**; now requires a JWT with `role = 'admin'`
- [x] Migration `002_user_roles.js` + `db/promote-admin.js` / `db/demote-admin.js`
- [x] Order creation wrapped in `db.transaction()` (header + lines + stock + cart clear)
- [x] `POST /api/orders` returns the **complete** order → fixes the confirmation page
- [x] Guest → user cart merge on login/register (`services/cart.js → mergeGuestCartIntoUser`)
- [x] Admin product write no longer `INSERT OR REPLACE`; **partial updates** preserve `rating`/`reviews`/`created_at`/anything not sent
- [x] `DELETE /api/admin/products/:id` returns 409 with a helpful message instead of a 500 FK error
- [x] Email normalisation (trim + lowercase) — `A@B.com` and `a@b.com` are now one account
- [x] Broke the `server.js` ↔ `routes/*` circular import (new `config.js` + `db.js`)
- [x] `services/pricing.js` — single source of truth for subtotal/shipping/tax/total
- [x] `/api/cart` now returns server-computed money **and** a camelCase DTO (was raw snake_case rows)
- [x] `GET /api/products` — Zod-validated query, `X-Total-Count`, category added to search
- [x] New `GET /api/products/meta/categories` (real categories + counts)
- [x] New `GET /api/admin/stats`, `GET/PATCH /api/admin/orders/:id`, `GET /api/admin/subscribers`
- [x] Guest order read-back: `GET /api/orders/:id` allows the owning session, not just auth
- [x] Variant must belong to the product (was any variant id)
- [x] Rate limiting on `/api/subscribers`, tunable via env
- [x] JSON body limit, `/api` 404 handler, malformed-JSON/413 handling, graceful shutdown
- [x] Configurable CSP (image hosts allow-listed), `SERVE_STATIC` option
- [x] `db/init.js` now delegates to the migration runner (schema defined in one place)
- [x] Migrations run inside transactions and are idempotent
- [x] Login no longer leaks which emails are registered
- [x] WAL mode + foreign keys on

### Frontend breakers
- [x] **Category filter returned 0 products for every category** — the store now loads from
      `GET /api/products`, and `Product` carries a real `category`
- [x] **Order confirmation mismatch** — `checkout` stores the full order, `order-success`
      re-reads it from `GET /api/orders/:id` (with sessionStorage + localStorage fallbacks)
- [x] **XSS** — `utils/escape.ts` (`escapeHtml`/`escapeAttr`/`safeUrl`) applied to every
      `innerHTML` interpolation in cards, detail, cart, checkout and order pages
- [x] Cart drawer no longer steals focus on every page click (and restores the *previous* focus)
- [x] `clearCart()` clears localStorage too; offline mode is no longer sticky (`retryConnection`)
- [x] Server rejections (out of stock / 409) surface as errors instead of silently going offline
- [x] Footer newsletter was a `<div>` bound to `submit` → real `<form>`, now posts to `/api/subscribers`
- [x] Service worker: moved to `frontend/public/`, precache list only references files that exist,
      tolerant install, network-first navigations, never caches `/api/*` or cross-origin requests
- [x] `crypto.randomUUID()` secure-context fallback
- [x] `/favicon.ico` 404 → `/favicon.svg` everywhere; manifest + description added where missing
- [x] Wishlist: **persisted**, real `<button>` (no longer nested inside an `<a>`), `aria-pressed`,
      cross-tab sync, single delegated handler (was double-bound)
- [x] `#filters-toggle` `<div>` → `<button>` with `aria-expanded`/`aria-controls`
- [x] Checkout: real `name`/`id`/`required`/`autocomplete`, no more `input[placeholder="Jane"]`
      selectors, validation matching the server's Zod schema, card input formatting, tax shown as a
      line item, honest "demo mode — no payment is taken" notice
- [x] Checkout summary now comes from the server instead of duplicated client-side maths
- [x] New filters: **in stock only**, **on sale**, URL params (`?q=`, `?category=`, `?sort=`)
- [x] Cart drawer: free-shipping progress, offline notice, per-line variant info
- [x] Product page: real stock counts, sold-out states, disabled sold-out variants, breadcrumbs,
      document title, "product not found" state
- [x] Grid: skeleton loading state + a real empty state with a working "clear filters" button
- [x] Cart panels on shop/product/lookbook got the dialog ARIA that only `index.html` had
- [x] Skip links on every page, `:focus-visible` styling, `prefers-reduced-motion`
- [x] ESLint config (`.eslintrc.cjs`) — `npm run lint` now works and passes at 0 warnings
- [x] Inline page scripts extracted to `src/pages/*.ts` → **no inline scripts in the build**,
      so Helmet's CSP works even with `SERVE_STATIC=true`
- [x] Dead code removed: `setProductCatalog`/`addProduct`/`deleteProduct`/`resetToDefaults` were
      orphaned; `saveOrder`/`loadOrders`/`getSubscriberEmail` are now actually used; orphaned
      `tsconfig.node.json` deleted
- [x] New `src/types/product.ts` mirroring the API + a `mapApiProduct` mapper
- [x] CSS: badges, skeletons, notices, order pages, filter counts, sold-out states, a11y helpers

### Testing (was: none)
- [x] `backend/tests/api.test.mjs` — **39 integration tests**, Node's built-in `node:test`, zero new deps
- [x] `frontend/src/**/*.test.ts` — **44 unit tests** (Vitest + jsdom): filters, escaping, pricing, cart store
- [x] Regression tests specifically for the category-filter bug and the Zod `.optional().default('')` trap

---

## Phase 2 — API wiring  ✅
- [x] Catalogue loads from `GET /api/products` with a localStorage cache + built-in fallback
- [x] Real `category`, `stock` and `created_at` drive filtering and "Newest first"
- [x] Skeleton / empty / offline states
- [x] `src/types/product.ts` mirrors `schemas.product`
- [ ] ⬜ Move filtering/sorting/pagination **to the server** (currently client-side over the
      fetched catalogue — fine at 5 products, wrong at 5,000)
- [ ] ⬜ Cache invalidation when an admin edits a product

## Phase 3 — Auth & accounts  ✅
- [x] `account.html` + `src/pages/account.ts` — sign in / register tabs, profile, password,
      order history, wishlist, sign out
- [x] `features/auth/session.ts` — auth store; re-validates the token on boot and drops it on 401
- [x] `features/auth/header.ts` — account menu rendered into a single `[data-account-slot]`
      on all 7 pages (no markup duplicated across HTML files)
- [x] Order history from `GET /api/orders` with status pills
- [x] Server-side wishlist: `wishlist` table, `/api/wishlist` CRUD, `PUT` bulk replace,
      localStorage mirror, and the guest list is pushed up on first login
- [x] `PATCH /api/auth/me` (partial profile update) and `POST /api/auth/password`
- [x] Guest cart adopted on **both** register and login
- [x] Signed-in users get their name/email prefilled at checkout
- [ ] ⬜ Token refresh (tokens currently live for `JWT_EXPIRES_IN`, then the user signs in again)

## Phase 4 — Payments  ✅ (demo gateway, Stripe-ready)
- [x] `services/payments.js` — provider abstraction; the app never touches a driver directly
- [x] **Demo driver** that mirrors Stripe's test cards (4242 succeeds, 4000…0002 declines,
      4000…9995 insufficient funds, 4000…0069 expired, 4100…0010 fraud)
- [x] Two-step flow: `POST /api/orders` → `pending_payment` + payment intent, then
      `POST /api/orders/:id/pay` → `paid`
- [x] A decline returns 402 and leaves the order payable — **retrying never duplicates the order**
- [x] Stock is reserved on order and **returned on cancel** (`POST /api/orders/:id/cancel`)
- [x] Only `card_last4` is persisted; the PAN is used once and discarded (asserted in tests)
- [x] `GET /api/store-config` tells the UI the payment mode, so the checkout notice is honest
- [x] `services/orderStatus.js` — one lifecycle vocabulary shared by routes, admin and UI
- [x] Stripe driver scaffolded behind `PAYMENT_PROVIDER=stripe`
- [ ] ⬜ **Before going live:** Stripe Elements in the browser, a signature-verified
      `payment_intent.succeeded` webhook, and idempotency keys

## Phase 5 — Admin panel  ✅
- [x] `admin.html` + `src/pages/admin.ts` + `src/features/admin/views.ts` — five tabs behind
      an admin-role gate, with deep links (`admin.html#products`)
- [x] **Dashboard** — revenue, orders, awaiting-payment, customers, product/publishing counts,
      subscribers, and a low-stock list with a jump-to-edit button
- [x] **Products** — searchable table with inline Published / Featured switches, an editor for
      every field, and delete that explains itself when an order blocks it
- [x] **Images** — paste a URL *or* upload from your computer (`POST /api/admin/uploads`,
      5 MB, PNG/JPEG/WebP/GIF/AVIF, SVG refused), plus a 6-image gallery
- [x] **Sizes & colours** — a stock grid built from two comma-separated lists, with
      auto-generated SKUs; `PUT …/variants` keeps unchanged pairs' row ids
- [x] **Homepage** — every editable string on the public site, grouped into sections with
      per-section reset
- [x] Publishing model: `published` / `featured` / `gallery` columns (migration 004);
      `GET /api/products` hides unpublished rows unless an admin token is sent
- [x] `data-setting` hooks across `index.html` + `features/content/siteSettings.ts`
- [x] `GET /api/settings` (public), `GET/PUT /api/admin/settings`, `POST …/settings/reset`
- [x] Orders tab with an inline status selector; subscribers tab with copy-all
- [x] Admins get a **Store admin** link in the header account menu
- [x] 18 new integration tests (74 total) + a 40-check admin smoke test through the Vite proxy
- [x] Vite dev proxy now forwards `/uploads` so uploaded images preview in development
- [x] **Browser-based admin sign-up** — no terminal needed. `GET /api/auth/admin-setup`
      reports whether the door is open; `POST /api/auth/register-admin` creates the first
      admin (or another one with `ADMIN_SETUP_KEY`), and upgrades an existing storefront
      account when you supply its password
- [x] **Team & access** on the Dashboard: list every account, promote/demote with one click,
      and self-demotion is refused so you can't lock yourself out
- [x] **Auto-migrate + auto-seed on boot** — a fresh clone needs nothing but `npm run dev`.
      This was the actual reason the admin page was unreachable: the shipped database had
      only migration 001, so the `role` column did not exist
- [ ] Admin login gate using the `role` claim
- [ ] Image upload instead of pasting Unsplash URLs

## Phase 6 — Catalogue & content  🔄 (half done)
- [x] **Categories are first-class** (migration 005 + `services/categories.js`): slug, name,
      description, tile image, sort order, published flag
- [x] `GET /api/categories` (public) and full admin CRUD; deleting an in-use category is a
      helpful 409; renaming one moves its products with it
- [x] Homepage tiles are now **real links** to real collection pages, rendered from the API
      with live product counts and a "New" flag on empty collections
- [x] `shop.html?category=men` shows a men-only page; the slug, the name or any case works
- [x] Header navigation on every page is rebuilt from the live categories — the old four
      links that pointed at two anchors are gone
- [x] "Showing: Men ✕" active-filter chips on the shop, removable in one click
- [x] Saving a product under a brand-new category creates that category publicly
- [x] The seed now ships 9 products across Women, Men, Tops, Bags, Shoes and Dresses, so no
      collection page is empty
- [x] `services/accounts.js` — every account and admin-access rule in one file; routes are thin
- [ ] Self-hosted images (Unsplash hotlinks will rate-limit or break; the CSP already allow-lists them)
- [ ] Real reviews instead of hardcoded `★★★★★` / `(124 reviews)` strings
- [ ] Footer columns are still dead text

## Phase 7 — Quality & polish  ⬜
- [x] Test suites + `npm run verify`
- [ ] CI (GitHub Actions: typecheck → lint → unit → build → migrate/seed → integration)
- [ ] Dockerfile / docker-compose
- [ ] Lighthouse pass (self-host fonts, modern image formats, `srcset`)
- [ ] Dark-mode toggle (the `html.dark-mode` theme already exists in CSS)
- [ ] 404 page
- [ ] Replace `console.*` with a small logger; request logging in dev
