# FashionHub — LUNORA

A fashion storefront: an Express + SQLite API and a **framework-free** Vite/TypeScript frontend.

```
backend/    Express 4 · better-sqlite3 · JWT · Zod · Helmet · rate limiting
frontend/   Vite 5 · TypeScript (strict) · 6 static HTML pages · no UI framework
```

---

## Quick start

```bash
# 1. Install everything
npm install --prefix backend
npm install --prefix frontend

# 2. Configure the API
cp backend/.env.example backend/.env      # then set JWT_SECRET

# 3. Run the API (:3001) and the dev server (:5173) together
npm run dev
```

That's it — the server **creates the database, applies every migration and seeds the demo
catalogue on first boot**, so there is no separate setup step. Then open
**http://localhost:5173/admin.html** and create your admin account.

`npm run setup` does the same thing plus an explicit `db:setup`, if you prefer it.

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend, so
there is no CORS setup to do in development.

### Pages

| Page | What's on it |
|---|---|
| `index.html` | Hero, live collection tiles, featured grid, newsletter |
| `shop.html` | Collection pages via `?category=slug`, search, price/availability filters, sorting, active-filter chips |
| `product.html?id=…` | Detail view with size/colour variants and stock |
| `checkout.html` | Address + card, server-computed totals, two-step payment |
| `order-success.html?id=…` | Confirmation — re-reads the order from the API |
| `account.html` | Sign in / register, profile, password, order history, wishlist |
| `admin.html` | **Store admin** — dashboard, products, homepage content, orders, subscribers |
| `lookbook.html` | Editorial content |

> `npm run setup` runs `npm install` in both `backend/` and `frontend/`, then
> `npm run db:setup` (migrate + seed). Re-running it is safe.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | API + web together, colourised and prefixed |
| `npm run dev:backend` / `dev:frontend` | One tier only |
| `npm run build` | Typecheck + production build into `frontend/dist` |
| `npm run preview` | Serve the built site |
| `npm run test` | Unit tests (Vitest) **and** API integration tests |
| `npm run test:unit` | Frontend logic only — no server needed |
| `npm run test:api` | Integration suite — needs a running API (see below) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run verify` | typecheck → lint → build → unit tests |
| `npm run db:migrate` / `db:seed` | Apply migrations / reload the catalogue |
| `npm run db:promote -- you@example.com` | Grant an account the `admin` role |

### Running the API tests

They talk to a **live server**, so start one first on a throwaway database:

```bash
cd backend
npm run db:setup          # creates/overwrites backend/fashionhub.db
npm run dev
# in another terminal:
npm run test:api          # or BASE_URL=http://localhost:3001 node --test backend/tests/
```

They create users, carts and orders — never point them at a database you care about.

---

## Environment

All configuration lives in `backend/.env` (see `backend/.env.example`).

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `JWT_SECRET` | dev fallback | **Required** when `NODE_ENV=production` — the server refuses to boot without it |
| `JWT_EXPIRES_IN` | `7d` | |
| `CORS_ORIGINS` | `localhost:5173,localhost:3000` | Comma-separated |
| `AUTH_RATE_LIMIT` / `AUTH_RATE_WINDOW_MS` | `100` / `900000` | Raise these for test runs |
| `ADMIN_SETUP_KEY` | – | When set, allows creating further admins from `admin.html` |
| `AUTO_MIGRATE` | `true` | Apply pending migrations on boot |
| `AUTO_SEED` | dev: `true` | Seed the demo catalogue when `products` is empty. Off in production |
| `DB_PATH` | `backend/fashionhub.db` | |
| `SERVE_STATIC` | `false` | Set `true` to let Express also serve `frontend/dist` on one origin |
| `PAYMENT_PROVIDER` | `demo` | `demo` (simulated gateway) or `stripe` |
| `STRIPE_SECRET_KEY` | – | Required when `PAYMENT_PROVIDER=stripe` |
| `API_URL` (frontend) | `http://localhost:3001` | Vite dev proxy target |

---

## Architecture

```
browser
  │
  ├─ Vite dev server :5173 ──── /api/* proxy ───┐
  │                                             ▼
  └─ frontend/src                        Express :3001
       main.ts  ── bootstrap ──►  features/cart      ──► /api/cart
                                  features/products  ──► /api/products
                                  features/auth      ──► /api/subscribers
                                  pages/checkout     ──► /api/orders
                                               better-sqlite3
                                                 fashionhub.db
```

### Backend layout

| Path | Purpose |
|---|---|
| `server.js` | App assembly: Helmet/CSP, CORS, JSON limit, rate limiting, route mounting, 404 + error handlers, graceful shutdown |
| `config.js` | Every env var in one typed object |
| `db.js` | The single `better-sqlite3` handle (WAL, foreign keys on) |
| `middleware/auth.js` | `authMiddleware`, `optionalAuth`, `requireRole`, `requireAdmin`, `signToken` |
| `middleware/validate.js` | Zod schemas + the `validate()` middleware |
| `services/cart.js` | Cart identity, queries, stock lookups, guest→user merge |
| `services/pricing.js` | **The** place order maths lives (subtotal, shipping, tax, total) |
| `services/payments.js` | Gateway abstraction + the `demo` and `stripe` drivers |
| `services/orderStatus.js` | Order lifecycle constants and predicates |
| `services/settings.js` | Editable homepage copy: defaults, allowed keys, read/write |
| `services/categories.js` | Collections: slugs, ordering, public/admin lists, URL resolution |
| `services/accounts.js` | **Every** account rule in one file: registration, login, profile, password, roles, the admin bootstrap |
| `routes/*` | `auth`, `products`, `cart`, `orders`, `subscribers`, `admin` |
| `db/migrations/` | Numbered, transactional migrations |
| `tests/api.test.mjs` | 39 integration tests, Node's built-in runner, zero extra deps |

### Frontend layout

| Path | Purpose |
|---|---|
| `src/main.ts` | Bootstraps every page: loads cart + catalogue in parallel, wires UI, registers the service worker |
| `src/api/client.ts` | Typed `fetch` wrapper; injects the session id and bearer token; throws `ApiError` |
| `src/features/products/` | `catalog` (API → cache → defaults), `filters` (pure), `render` (cards, grid, detail, variants), `search-ui` |
| `src/features/cart/` | `state` (store + offline fallback) and `ui` (drawer, focus trap) |
| `src/features/auth/` | `session` (auth store), `header` (account menu), `Newsletter` |
| `src/features/admin/` | `views.ts` — every admin panel render function |
| `src/features/content/` | `siteSettings.ts` — applies admin copy to the public pages |
| `src/bootstrap.ts` | The boot sequence shared by every page, including checkout |
| `src/pages/` | `account.ts`, `admin.ts`, `checkout.ts`, `order-success.ts` — page entry points |
| `src/utils/` | `escape` (XSS), `pricing` (offline mirror of the server rules), `storage`, `format`, `images` |
| `src/types/` | `product.ts` and `cart.ts` — shared shapes mirroring the API |

### Data model

`users` · `products` · `product_variants` (size/colour/SKU/stock) · `cart_items` ·
`orders` · `order_items` (price snapshot) · `subscribers` · `migrations`

Carts are keyed by **either** `user_id` **or** `session_id`, so guests can shop without
an account; on login the guest cart is merged into the account.

---

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/health` | – | |
| `POST` | `/api/auth/register` | – | Returns `{token, user, cartMerged}`; adopts the guest cart |
| `POST` | `/api/auth/login` | – | Adopts the guest cart |
| `GET` | `/api/auth/me` | bearer | Re-validates the token on boot |
| `PATCH` | `/api/auth/me` | bearer | Update first/last name (partial) |
| `POST` | `/api/auth/password` | bearer | Change password; returns a fresh token |
| `GET` | `/api/auth/admin-setup` | – | Says whether admin sign-up is open and needs a key |
| `POST` | `/api/auth/register-admin` | setup key *or* first run | Creates/promotes an admin |
| `GET` | `/api/products` | – | `category`, `search`, `sort`, `minPrice`, `maxPrice`, `featured`, `limit`, `offset`; total in `X-Total-Count`. **Unpublished products are hidden** unless you send an admin token |
| `GET` | `/api/categories` | – | Published collections with slugs, images, ordering and live product counts |
| `GET` | `/api/products/meta/categories` | – | Same data, `{name,count}` shape, for older clients |
| `GET` | `/api/products/:id` | – | Includes `variants` |
| `GET` | `/api/products/:id/variants` | – | |
| `GET` `POST` `PATCH` `DELETE` | `/api/cart[/:itemId]` | optional | Works for guests via `X-Session-Id` |
| `POST` | `/api/orders` | optional | Creates a `pending_payment` order, reserves stock, returns a payment intent |
| `POST` | `/api/orders/:id/pay` | owner | Authorises with the gateway → `paid`; `402` on decline |
| `POST` | `/api/orders/:id/cancel` | owner | Cancels an unpaid order and **returns the reserved stock** |
| `GET` | `/api/orders` | bearer | The user's orders |
| `GET` | `/api/orders/:id` | owner | The buyer **or** the guest session that placed it |
| `GET` `POST` `PUT` `DELETE` | `/api/wishlist[/:productId]` | bearer | Server-side wishlist; `PUT` bulk-replaces |
| `POST` | `/api/subscribers` | – | Rate limited, idempotent |
| `GET` | `/api/settings` | – | Public homepage copy — see *Store admin* below |
| `GET` | `/api/store-config` | – | Public payment mode + pricing rules |
| `*` | `/api/admin/*` | **admin role** | See below |

### Admin endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/stats` | Revenue, order/product/customer counts, low-stock list |
| `GET` `POST` | `/api/admin/products` | List all (including hidden) / upsert. **Partial updates** — send only the keys you want to change |
| `DELETE` | `/api/admin/products/:id` | 409 with an explanation if the product appears in an order |
| `PUT` | `/api/admin/products/:id/variants` | Replace the size × colour matrix; unchanged pairs keep their row id |
| `POST` | `/api/admin/uploads` | Store a product image, returns `{url}`. PNG/JPEG/WebP/GIF/AVIF, 5 MB, **no SVG** |
| `GET` `PUT` | `/api/admin/settings` | Read / edit the homepage copy. Unknown keys are rejected, links are validated |
| `POST` | `/api/admin/settings/reset` | Reset some or all fields to their defaults |
| `GET` | `/api/admin/orders` · `GET`/`PATCH` `/api/admin/orders/:id[/status]` | Order queue and status changes |
| `GET` `POST` | `/api/admin/categories` | List (incl. hidden) / create |
| `PATCH` `DELETE` | `/api/admin/categories/:id` | Rename/reorder/hide · delete (409 while in use) |
| `GET` | `/api/admin/subscribers` | Newsletter list |
| `GET` | `/api/admin/users` | Every account (never includes password hashes) |
| `PATCH` | `/api/admin/users/:id/role` | Promote/demote. Refuses to demote you |

`GET /api/cart` returns server-computed money, so the checkout never re-implements the rules:

```json
{ "items": [...], "count": 2, "subtotal": 119.98, "shipping": 0,
  "tax": 9.6, "total": 129.58, "currency": "USD", "freeShippingThreshold": 99 }
```

### Creating the first admin account

**You don't need a terminal.** While the store has no administrator, `admin.html` offers a
"Create the first admin account" form — fill it in and you're in. The server prints a
reminder on boot:

```
! No admin account yet — open /admin.html and create the first one.
```

That door closes the moment an admin exists, so nobody can appoint themselves later. From
then on there are two ways to add another admin:

1. **From the panel** — Dashboard → *Team & access* → **Make admin**. They pick up the role
   next time they sign in.
2. **With a setup key** — put `ADMIN_SETUP_KEY=something-long` in `backend/.env`, restart,
   and `admin.html` will accept new admin registrations that include that key. Remove the
   key to close sign-up again.

The create form also **upgrades an existing storefront account**: enter its email and
current password and it is promoted rather than duplicated (a wrong password is rejected,
so this cannot be used to hijack an account).

Two guards worth knowing: you cannot remove your own admin access, and passwords are never
returned by any admin endpoint.

<details>
<summary>Or from the command line</summary>

```bash
npm run db:promote -- you@example.com   # grant, after registering that address
npm run db:demote  -- you@example.com   # revoke
```
</details>

---

## Design decisions worth knowing

* **The server owns the money.** Free shipping over $99, $9.99 flat, 8% tax — defined once
  in `backend/services/pricing.js`. The browser reads those numbers back from
  `GET /api/cart`; `src/utils/pricing.ts` is only used when the API is unreachable.
* **Everything interpolated into `innerHTML` goes through `escapeHtml()` / `safeUrl()`.**
  Product names come from the admin API, so they are treated as untrusted.
* **Offline-first cart.** If the API can't be reached the cart transparently moves to
  `localStorage`, shows an "offline" notice, and re-syncs when the connection returns.
  A *server rejection* (out of stock, validation) is **not** treated as offline — it surfaces.
* **Stock is checked twice** — when a line is added and again when the order is placed —
  and the whole order (header, lines, stock decrement, cart clear) runs in one transaction.
* **Admin routes require a real admin JWT.** There is no unauthenticated write path.
* **No inline scripts in the build**, so `helmet()`'s CSP works even when Express serves
  `frontend/dist` (`SERVE_STATIC=true`).

---

## Store admin

`admin.html` is the control room. It requires an account with the `admin` role; anyone else
gets a 403 and a sign-in gate. Once signed in as an admin, **Store admin** appears in the
header account menu. Deep links work: `admin.html#products`, `#content`, `#orders`,
`#subscribers`.

**Products** — add, edit and delete; toggle **Published** (invisible in the shop and
unreachable by URL when off) and **Featured** (drives the homepage grid) straight from the
table. Saving a product under a category that doesn't exist yet creates that category.

**Categories** — your collections. Each one becomes a collection page
(`shop.html?category=slug`), a homepage tile, a shop filter and a header-navigation link.
Create, rename, reorder (lower number = earlier), upload a tile image, publish/hide, or
delete (refused while products still use it). Hiding removes it from every public surface
without touching its products. The editor covers price, sale price, category, stock, description, feature bullets,
rating display, a main image and up to six gallery images — each either pasted as a URL or
**uploaded from your computer** — plus a size × colour stock grid that generates SKUs
automatically.

**Homepage** — edits the live storefront copy: an announcement bar, the hero eyebrow,
heading, subtitle, both buttons and their links, the hero image and its alt text, the three
trust badges, the featured-section heading and link, the newsletter block and the footer
blurb. Each section can be reset to its defaults individually.

The public pages pick this up through `data-setting` attributes:

```html
<h1 data-setting="heroTitle">Elevate Your Everyday Style</h1>
<a data-setting="heroCtaPrimaryLabel" data-setting-href="heroCtaPrimaryHref">Shop Now →</a>
<img data-setting-src="heroImage" data-setting-alt="heroImageAlt" src="…" alt="…" />
<div data-setting="announcement" data-setting-hide-when-empty="true" hidden></div>
```

`src/features/content/siteSettings.ts` applies them on boot. Text is written with
`textContent` and URLs pass through `safeUrl()`, and the server validates link-shaped
settings and rejects unknown keys — so a compromised admin account cannot inject markup or
a `javascript:` link into the storefront. To make another element editable, add one
`data-setting` attribute and one line to `DEFAULT_SETTINGS` in `backend/services/settings.js`.

**Orders** — the full queue with customer, total and an inline status selector.
**Subscribers** — the newsletter list, with copy-all.
**Team & access** (on the Dashboard) — every account with its role and order count, and a
one-click promote/demote. Your own row has no control, so you cannot lock yourself out.

Uploaded images land in `backend/uploads/` (git-ignored) and are served from `/uploads`
with `X-Content-Type-Options: nosniff` and a `default-src 'none'; img-src 'self' data:` CSP.
The Vite dev server proxies `/uploads` so previews work in development.

---

## Payments — demo gateway

`PAYMENT_PROVIDER` selects the driver (default `demo`). The app only ever talks to
`backend/services/payments.js`, so switching to Stripe means implementing that one module.

**Flow:** `POST /api/orders` creates the order as `pending_payment` and reserves stock →
the browser calls `POST /api/orders/:id/pay` with the card → the gateway authorises →
`paid` (+ `paid_at`, `card_last4`). A decline returns `402` and leaves the order payable,
so a retry never creates a duplicate. `POST /api/orders/:id/cancel` restocks.

**Demo cards** (the driver mirrors Stripe's test numbers):

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 0069` | Expired card |
| `4100 0000 0000 0010` | Flagged as fraudulent |

Any other Luhn-valid number succeeds. The full card number is validated, used once and
discarded — **only the last four digits are stored**.

> ⚠️ **Before going live:** never send raw card numbers to this server. That brings the
> whole site into PCI-DSS scope. Set `PAYMENT_PROVIDER=stripe`, replace the card inputs
> with Stripe Elements, and flip orders to `paid` only from a signature-verified
> `payment_intent.succeeded` webhook. The `stripe` driver in `services/payments.js` is a
> starting point, not production-ready.

---

## Roadmap

`FIXPLAN.md` tracks every phase: what's fixed, what's next, and what's blocked on a
decision. Phases 1–5 are complete (blockers, security, repo hygiene, API wiring, accounts, demo
payments, admin panel and browser-based admin sign-up), plus the first half of Phase 6:
real category collections with public pages, live tiles and navigation. Remaining: self-hosted
imagery, reviews, CI/Docker and polish.

---

## Tech notes

* Node **20+** (`node --test`, `--watch`, native ESM).
* `better-sqlite3` is a **native module**: after cloning, run `npm install` inside
  `backend/` so it builds/downloads for your platform. It cannot be copied between
  machines or architectures.
* The database is git-ignored. Create it with `npm run db:setup`.
* `frontend/dist` is git-ignored too — build it in CI or on the host.
