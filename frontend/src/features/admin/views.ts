import { escapeAttr, escapeHtml, safeUrl } from '@utils/escape.ts';
import { formatCurrency } from '@utils/format.ts';
import type {
  AdminOrder,
  AdminProduct,
  AdminStats,
  AdminSubscriber,
  AdminUser,
  Category,
} from '@api/client.ts';
import type { SiteSettings } from '@features/content/siteSettings.ts';

/**
 * Pure render functions for the admin panel.
 *
 * Everything here returns an HTML string built from escaped values — the panel
 * renders product names, descriptions and settings text that an admin typed, so
 * nothing is interpolated raw.
 */

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'content'
  | 'orders'
  | 'subscribers';

export const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'content', label: 'Homepage' },
  { id: 'orders', label: 'Orders' },
  { id: 'subscribers', label: 'Subscribers' },
];

/* ------------------------------------------------------------------ gate */

export interface GateStatus {
  canCreateAdmin: boolean;
  requiresSetupKey: boolean;
  firstRun: boolean;
}

export type GateMode = 'signin' | 'create';

export function renderGate(status: GateStatus | null, mode: GateMode, error?: string): string {
  if (mode === 'create' && status?.canCreateAdmin) {
    return renderCreateAdminForm(status, error);
  }
  return renderSignIn(status, error);
}

function renderSignIn(status: GateStatus | null, error?: string): string {
  return `
    <section class="admin-gate">
      <p class="eyebrow">Restricted</p>
      <h1>Admin sign in</h1>
      <p class="admin-gate-lede">
        This area needs an account with the <code>admin</code> role.
      </p>

      <form class="admin-gate-form" data-gate-form novalidate>
        <label><span>Email</span>
          <input type="email" name="email" autocomplete="username" required autofocus />
        </label>
        <label><span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>

        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ''}

        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>

      ${
        status?.canCreateAdmin
          ? `<div class="admin-gate-alt">
               <span>No admin account yet?</span>
               <button type="button" class="btn btn-light" data-gate-create>
                 ${status.firstRun ? 'Create the first admin account' : 'Create an admin account'}
               </button>
             </div>`
          : `<div class="admin-gate-locked">
               <p>
                 Admin sign-up is closed because an administrator already exists.
               </p>
               <p>
                 Ask an existing admin to promote your account from
                 <strong>Dashboard → Team &amp; access</strong>, or set
                 <code>ADMIN_SETUP_KEY</code> in <code>backend/.env</code> and restart the API.
               </p>
             </div>`
      }

      <p><a class="link-more" href="index.html">← Back to the store</a></p>
    </section>
  `;
}

function renderCreateAdminForm(status: GateStatus, error?: string): string {
  return `
    <section class="admin-gate">
      <p class="eyebrow">${status.firstRun ? 'First run' : 'Administrator'}</p>
      <h1>Create an admin account</h1>

      <div class="admin-gate-note" role="note">
        ${
          status.firstRun
            ? `This store has no administrator yet, so the first account created here gets
               full admin access. If you already registered this email on the storefront,
               enter that account's password and it will be upgraded instead of duplicated.`
            : `An administrator already exists, so the server's setup key is required.
               You'll find it as <code>ADMIN_SETUP_KEY</code> in <code>backend/.env</code>.`
        }
      </div>

      <form class="admin-gate-form" data-create-admin-form novalidate>
        <div class="form-grid">
          <label><span>First name</span>
            <input type="text" name="firstName" autocomplete="given-name" placeholder="Ada" />
          </label>
          <label><span>Last name</span>
            <input type="text" name="lastName" autocomplete="family-name" placeholder="Lovelace" />
          </label>
        </div>

        <label><span>Email</span>
          <input type="email" name="email" autocomplete="username" required />
        </label>

        <label><span>Password</span>
          <input type="password" name="password" autocomplete="new-password" required minlength="8"
            aria-describedby="admin-pw-hint" />
          <span class="field-hint" id="admin-pw-hint">At least 8 characters.</span>
        </label>

        ${
          status.requiresSetupKey
            ? `<label><span>Setup key</span>
                <input type="password" name="setupKey" autocomplete="off" required
                  placeholder="ADMIN_SETUP_KEY" />
               </label>`
            : ''
        }

        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ''}

        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Create admin account</button>
          <button type="button" class="btn btn-light" data-gate-back>I already have one</button>
        </div>
      </form>

      <p><a class="link-more" href="index.html">← Back to the store</a></p>
    </section>
  `;
}

/* ----------------------------------------------------------------- shell */

export function renderShell(tab: AdminTab, adminName: string): string {
  return `
    <header class="admin-header">
      <div>
        <p class="eyebrow">LUNORA</p>
        <h1>Store admin</h1>
      </div>
      <div class="admin-header-actions">
        <span class="admin-user">${escapeHtml(adminName)}</span>
        <a class="btn btn-light" href="index.html" target="_blank" rel="noopener">View store</a>
        <button type="button" class="btn" data-admin-sign-out>Sign out</button>
      </div>
    </header>

    <nav class="admin-tabs" role="tablist" aria-label="Admin sections">
      ${TABS.map(
        (t) => `
        <button type="button" role="tab" class="admin-tab${t.id === tab ? ' active' : ''}"
          data-tab="${escapeAttr(t.id)}" aria-selected="${t.id === tab}">${escapeHtml(t.label)}</button>`
      ).join('')}
    </nav>

    <section class="admin-panel" data-panel aria-live="polite">
      <p class="admin-loading">Loading…</p>
    </section>
  `;
}

/* ------------------------------------------------------------- dashboard */

function statCard(label: string, value: string, tone = ''): string {
  return `
    <div class="stat-card ${tone}">
      <span class="stat-value">${escapeHtml(value)}</span>
      <span class="stat-label">${escapeHtml(label)}</span>
    </div>
  `;
}

export function renderTeam(users: AdminUser[], currentUserId?: number): string {
  return `
    <h3>Team &amp; access</h3>
    <p class="field-hint">
      Anyone marked <strong>Admin</strong> can sign in here and change products, homepage
      content and orders. You cannot remove your own access.
    </p>

    ${
      users.length
        ? `<ul class="admin-list">
            ${users
              .map((u) => {
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
                const isSelf = u.id === currentUserId;
                const admin = u.role === 'admin';
                return `
              <li>
                <span>
                  <strong>${escapeHtml(name)}</strong>
                  <span class="admin-sub">${escapeHtml(u.email)}</span>
                  <span class="admin-sub">
                    ${escapeHtml(u.orderCount)} order${u.orderCount === 1 ? '' : 's'}
                    ${isSelf ? ' · <em>you</em>' : ''}
                  </span>
                </span>
                <span class="role-pill ${admin ? 'role-admin' : ''}">${escapeHtml(admin ? 'Admin' : 'Customer')}</span>
                ${
                  isSelf
                    ? ''
                    : `<button type="button" class="btn btn-light" data-set-role="${escapeAttr(
                        u.id
                      )}" data-role="${admin ? 'customer' : 'admin'}">
                         ${admin ? 'Remove admin' : 'Make admin'}
                       </button>`
                }
              </li>`;
              })
              .join('')}
           </ul>`
        : '<p class="admin-empty">No accounts yet.</p>'
    }
  `;
}

export function renderDashboard(stats: AdminStats): string {
  return `
    <h2>Overview</h2>

    <div class="stat-grid">
      ${statCard('Revenue (paid)', formatCurrency(Number(stats.revenue)))}
      ${statCard('Orders', String(stats.orders))}
      ${statCard('Awaiting payment', String(stats.awaitingPayment), stats.awaitingPayment ? 'warn' : '')}
      ${statCard('Customers', String(stats.customers))}
      ${statCard('Products', String(stats.products))}
      ${statCard('Live on the site', String(stats.published))}
      ${statCard('Hidden', String(stats.hidden), stats.hidden ? 'warn' : '')}
      ${statCard('Featured on homepage', String(stats.featured))}
      ${statCard('Subscribers', String(stats.subscribers))}
    </div>

    <h3>Low stock (5 or fewer)</h3>
    ${
      stats.lowStock.length
        ? `<ul class="admin-list">
            ${stats.lowStock
              .map(
                (p) => `
              <li>
                <span>${escapeHtml(p.name)}</span>
                <strong class="${p.stock === 0 ? 'danger' : 'warn'}">${escapeHtml(p.stock)} left</strong>
                <button type="button" class="btn btn-light" data-edit-product="${escapeAttr(p.id)}">
                  Edit
                </button>
              </li>`
              )
              .join('')}
           </ul>`
        : '<p class="admin-empty">Nothing is running low.</p>'
    }
  `;
}

/* -------------------------------------------------------------- products */

export function renderProductTable(products: AdminProduct[], query: string): string {
  const filtered = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.id.toLowerCase().includes(query.toLowerCase()) ||
          (p.category ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : products;

  return `
    <div class="admin-toolbar">
      <h2>Products <span class="admin-count">${filtered.length}</span></h2>
      <div class="admin-toolbar-actions">
        <input type="search" class="admin-search" data-product-search
          placeholder="Filter by name, id or category…" value="${escapeAttr(query)}"
          aria-label="Filter products" />
        <button type="button" class="btn btn-primary" data-new-product>+ Add product</button>
      </div>
    </div>

    ${
      filtered.length
        ? `<div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Category</th>
                  <th scope="col" class="num">Price</th>
                  <th scope="col" class="num">Stock</th>
                  <th scope="col">On site</th>
                  <th scope="col">Homepage</th>
                  <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(productRow).join('')}
              </tbody>
            </table>
           </div>`
        : '<p class="admin-empty">No products match that filter.</p>'
    }
  `;
}

function productRow(p: AdminProduct): string {
  const soldOut = Number(p.stock) <= 0;
  return `
    <tr data-product-row="${escapeAttr(p.id)}">
      <td>
        <div class="admin-product-cell">
          ${p.image ? `<img src="${safeUrl(p.image, '')}" alt="" loading="lazy" decoding="async" />` : ''}
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <span class="admin-id">${escapeHtml(p.id)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(p.category ?? '—')}</td>
      <td class="num">
        ${formatCurrency(Number(p.price))}
        ${p.old_price ? `<span class="admin-was">${formatCurrency(Number(p.old_price))}</span>` : ''}
      </td>
      <td class="num ${soldOut ? 'danger' : ''}">${escapeHtml(p.stock)}</td>
      <td>
        <label class="switch">
          <input type="checkbox" data-toggle="published" data-id="${escapeAttr(p.id)}"
            ${p.published ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="visually-hidden">${escapeHtml(p.name)} visible on the site</span>
        </label>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" data-toggle="featured" data-id="${escapeAttr(p.id)}"
            ${p.featured ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="visually-hidden">${escapeHtml(p.name)} featured on the homepage</span>
        </label>
      </td>
      <td class="admin-actions">
        <button type="button" class="btn btn-light" data-edit-product="${escapeAttr(p.id)}">Edit</button>
        <button type="button" class="btn btn-danger" data-delete-product="${escapeAttr(p.id)}">Delete</button>
      </td>
    </tr>
  `;
}

/* --------------------------------------------------------- product editor */

export interface ProductFormState {
  id: string;
  name: string;
  price: string;
  old_price: string;
  category: string;
  stock: string;
  image: string;
  gallery: string[];
  description: string;
  features: string[];
  rating: string;
  reviews: string;
  published: boolean;
  featured: boolean;
  sizes: string;
  colors: string;
  variantStock: Record<string, number>;
}

export function emptyProductForm(): ProductFormState {
  return {
    id: '',
    name: '',
    price: '',
    old_price: '',
    category: '',
    stock: '0',
    image: '',
    gallery: [],
    description: '',
    features: [],
    rating: '',
    reviews: '',
    published: true,
    featured: false,
    sizes: '',
    colors: '',
    variantStock: {},
  };
}

export function productToForm(p: AdminProduct, sizes: string[], colors: string[]): ProductFormState {
  return {
    id: p.id,
    name: p.name ?? '',
    price: p.price != null ? String(p.price) : '',
    old_price: p.old_price != null ? String(p.old_price) : '',
    category: p.category ?? '',
    stock: String(p.stock ?? 0),
    image: p.image ?? '',
    gallery: [...(p.gallery ?? [])],
    description: p.description ?? '',
    features: [...(p.features ?? [])],
    rating: p.rating ?? '',
    reviews: p.reviews ?? '',
    published: p.published !== false,
    featured: Boolean(p.featured),
    sizes: sizes.join(', '),
    colors: colors.join(', '),
    variantStock: {},
  };
}

export function renderProductForm(state: ProductFormState, isNew: boolean): string {
  return `
    <div class="admin-toolbar">
      <h2>${isNew ? 'Add a product' : `Edit · ${escapeHtml(state.name || state.id)}`}</h2>
      <button type="button" class="btn btn-light" data-cancel-product>← Back to products</button>
    </div>

    <form class="admin-form" data-product-form novalidate>
      <fieldset>
        <legend>Basics</legend>

        <div class="form-grid">
          <label><span>Name</span>
            <input type="text" name="name" value="${escapeAttr(state.name)}" required maxlength="140" />
          </label>
          <label><span>URL slug (id)</span>
            <input type="text" name="id" value="${escapeAttr(state.id)}" required
              pattern="[a-z0-9]+(-[a-z0-9]+)*" ${isNew ? '' : 'readonly'}
              aria-describedby="slug-hint" placeholder="linen-blend-blazer" />
            <span class="field-hint" id="slug-hint">
              Lowercase letters, numbers and dashes.${isNew ? ' Generated from the name.' : ' Cannot be changed.'}
            </span>
          </label>
        </div>

        <div class="form-grid">
          <label><span>Price</span>
            <input type="number" name="price" value="${escapeAttr(state.price)}" min="0" step="0.01" required />
          </label>
          <label><span>Sale price (optional)</span>
            <input type="number" name="old_price" value="${escapeAttr(state.old_price)}" min="0" step="0.01"
              aria-describedby="old-price-hint" />
            <span class="field-hint" id="old-price-hint">Shown struck through when higher than the price.</span>
          </label>
        </div>

        <div class="form-grid">
          <label><span>Category</span>
            <input type="text" name="category" value="${escapeAttr(state.category)}" maxlength="60"
              list="category-options" placeholder="Women" />
            <datalist id="category-options"></datalist>
          </label>
          <label><span>Stock (product level)</span>
            <input type="number" name="stock" value="${escapeAttr(state.stock)}" min="0" step="1" />
          </label>
        </div>

        <label><span>Description</span>
          <textarea name="description" rows="4" maxlength="4000">${escapeHtml(state.description)}</textarea>
        </label>

        <label><span>Features (one per line)</span>
          <textarea name="features" rows="3" aria-describedby="features-hint">${escapeHtml(
            state.features.join('\n')
          )}</textarea>
          <span class="field-hint" id="features-hint">Shown as bullet points on the product page.</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Images</legend>

        <label><span>Main image</span>
          <div class="image-picker">
            <img class="image-preview" data-image-preview
              src="${safeUrl(state.image, '')}" alt="Preview" ${state.image ? '' : 'hidden'} />
            <div class="image-picker-fields">
              <input type="url" name="image" value="${escapeAttr(state.image)}"
                placeholder="https://… or /uploads/…" data-image-input />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                data-image-upload />
            </div>
          </div>
        </label>

        <div class="gallery-block">
          <span class="field-label">Gallery (up to 6 extra images)</span>
          <div class="gallery-list" data-gallery-list>
            ${state.gallery.map(galleryItem).join('') || '<p class="admin-empty">No extra images yet.</p>'}
          </div>
          <div class="gallery-add">
            <input type="url" placeholder="https://… or upload below" data-gallery-input />
            <button type="button" class="btn btn-light" data-gallery-add>Add URL</button>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              data-gallery-upload />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Visibility</legend>
        <label class="checkbox-row">
          <input type="checkbox" name="published" ${state.published ? 'checked' : ''} />
          <span><strong>Published</strong> — visible in the shop and on product pages.</span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" name="featured" ${state.featured ? 'checked' : ''} />
          <span><strong>Featured</strong> — shown in the homepage “Most Loved Picks” grid.</span>
        </label>

        <div class="form-grid">
          <label><span>Rating display (optional)</span>
            <input type="text" name="rating" value="${escapeAttr(state.rating)}" maxlength="40" placeholder="★★★★★" />
          </label>
          <label><span>Reviews display (optional)</span>
            <input type="text" name="reviews" value="${escapeAttr(state.reviews)}" maxlength="80" placeholder="(124 reviews)" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Sizes &amp; colours</legend>
        <p class="field-hint">
          Leave both blank for a one-size product. Otherwise every size × colour combination
          becomes a selectable option with its own stock.
        </p>

        <div class="form-grid">
          <label><span>Sizes (comma separated)</span>
            <input type="text" name="sizes" value="${escapeAttr(state.sizes)}" data-variant-sizes
              placeholder="XS, S, M, L, XL" />
          </label>
          <label><span>Colours (comma separated)</span>
            <input type="text" name="colors" value="${escapeAttr(state.colors)}" data-variant-colors
              placeholder="Beige, Black" />
          </label>
        </div>

        <button type="button" class="btn btn-light" data-build-matrix>Build stock grid</button>
        <div class="variant-matrix" data-variant-matrix></div>
      </fieldset>

      <p class="form-error" data-product-error role="alert" hidden></p>

      <div class="admin-form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create product' : 'Save changes'}</button>
        <button type="button" class="btn btn-light" data-cancel-product>Cancel</button>
      </div>
    </form>
  `;
}

function galleryItem(url: string): string {
  return `
    <div class="gallery-item" data-gallery-item>
      <img src="${safeUrl(url, '')}" alt="" loading="lazy" decoding="async" />
      <input type="hidden" name="gallery" value="${escapeAttr(url)}" />
      <button type="button" class="gallery-remove" data-gallery-remove aria-label="Remove image">×</button>
    </div>
  `;
}

export function renderVariantMatrix(
  sizes: string[],
  colors: string[],
  stock: Record<string, number>
): string {
  if (!sizes.length || !colors.length) return '';

  return `
    <table class="admin-table variant-table">
      <thead>
        <tr>
          <th scope="col">Size \\ Colour</th>
          ${colors.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${sizes
          .map(
            (size) => `
          <tr>
            <th scope="row">${escapeHtml(size)}</th>
            ${colors
              .map((color) => {
                const key = `${size}|${color}`;
                return `
              <td>
                <label class="visually-hidden" for="v-${escapeAttr(key)}">
                  Stock for ${escapeHtml(size)} ${escapeHtml(color)}
                </label>
                <input type="number" min="0" step="1" class="variant-stock"
                  id="v-${escapeAttr(key)}" data-size="${escapeAttr(size)}"
                  data-color="${escapeAttr(color)}" value="${escapeAttr(stock[key] ?? 0)}" />
              </td>`;
              })
              .join('')}
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <p class="field-hint">Saving replaces this product’s variant list. Existing size/colour pairs keep their identity.</p>
  `;
}

/* ----------------------------------------------------------- categories */

export interface CategoryFormState {
  id: number | null;
  name: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: string;
  published: boolean;
}

export function emptyCategoryForm(): CategoryFormState {
  return { id: null, name: '', slug: '', description: '', image: '', sortOrder: '', published: true };
}

export function categoryToForm(c: Category): CategoryFormState {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? '',
    image: c.image ?? '',
    sortOrder: String(c.sortOrder ?? 0),
    published: c.published !== false,
  };
}

export function renderCategoriesTable(categories: Category[]): string {
  return `
    <div class="admin-toolbar">
      <h2>Categories <span class="admin-count">${categories.length}</span></h2>
      <div class="admin-toolbar-actions">
        <button type="button" class="btn btn-primary" data-new-category>+ Add category</button>
      </div>
    </div>

    <p class="admin-lede">
      Categories become collection pages (<code>shop.html?category=slug</code>), the tiles on
      the homepage, the filter list in the shop and the links in the header navigation.
      Hiding one removes it from all of those without touching its products.
    </p>

    ${
      categories.length
        ? `<div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Slug</th>
                  <th scope="col" class="num">Products</th>
                  <th scope="col" class="num">Order</th>
                  <th scope="col">On site</th>
                  <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                ${categories
                  .map(
                    (c) => `
                <tr>
                  <td>
                    <div class="admin-product-cell">
                      ${
                        c.image
                          ? `<img src="${safeUrl(c.image, '')}" alt="" loading="lazy" decoding="async" />`
                          : ''
                      }
                      <div>
                        <strong>${escapeHtml(c.name)}</strong>
                        ${c.description ? `<span class="admin-sub">${escapeHtml(c.description)}</span>` : ''}
                      </div>
                    </div>
                  </td>
                  <td><span class="admin-id">${escapeHtml(c.slug)}</span></td>
                  <td class="num">${escapeHtml(c.productCount)}</td>
                  <td class="num">${escapeHtml(c.sortOrder)}</td>
                  <td>
                    <label class="switch">
                      <input type="checkbox" data-toggle-category="${escapeAttr(c.id)}"
                        ${c.published ? 'checked' : ''} />
                      <span class="switch-track" aria-hidden="true"></span>
                      <span class="visually-hidden">${escapeHtml(c.name)} visible on the site</span>
                    </label>
                  </td>
                  <td class="admin-actions">
                    <a class="btn btn-light" href="../shop.html?category=${escapeAttr(c.slug)}"
                      target="_blank" rel="noopener">View</a>
                    <button type="button" class="btn btn-light" data-edit-category="${escapeAttr(c.id)}">Edit</button>
                    <button type="button" class="btn btn-danger" data-delete-category="${escapeAttr(c.id)}">Delete</button>
                  </td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
           </div>`
        : '<p class="admin-empty">No categories yet — add your first collection.</p>'
    }
  `;
}

export function renderCategoryForm(state: CategoryFormState, isNew: boolean): string {
  return `
    <div class="admin-toolbar">
      <h2>${isNew ? 'Add a category' : `Edit · ${escapeHtml(state.name || state.slug)}`}</h2>
      <button type="button" class="btn btn-light" data-cancel-category>← Back to categories</button>
    </div>

    <form class="admin-form" data-category-form novalidate>
      <fieldset>
        <legend>Collection</legend>

        <div class="form-grid">
          <label><span>Name</span>
            <input type="text" name="name" value="${escapeAttr(state.name)}" required maxlength="60"
              placeholder="Men" />
          </label>
          <label><span>Slug (used in the URL)</span>
            <input type="text" name="slug" value="${escapeAttr(state.slug)}"
              pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="men"
              aria-describedby="cat-slug-hint" />
            <span class="field-hint" id="cat-slug-hint">
              Optional — generated from the name. Becomes
              <code>shop.html?category=…</code>
            </span>
          </label>
        </div>

        <label><span>Description (shown on the homepage tile)</span>
          <textarea name="description" rows="2" maxlength="500">${escapeHtml(state.description)}</textarea>
        </label>

        <label><span>Tile image</span>
          <div class="image-picker">
            <img class="image-preview" data-category-preview
              src="${safeUrl(state.image, '')}" alt="Preview" ${state.image ? '' : 'hidden'} />
            <div class="image-picker-fields">
              <input type="url" name="image" value="${escapeAttr(state.image)}"
                placeholder="https://… or /uploads/…" data-category-image-input />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                data-category-upload />
            </div>
          </div>
        </label>

        <div class="form-grid">
          <label><span>Sort order</span>
            <input type="number" name="sortOrder" value="${escapeAttr(state.sortOrder)}" min="0" step="10"
              aria-describedby="cat-order-hint" />
            <span class="field-hint" id="cat-order-hint">Lower numbers appear first everywhere.</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="published" ${state.published ? 'checked' : ''} />
            <span><strong>Published</strong> — shown as a tile, filter, nav link and collection page.</span>
          </label>
        </div>
      </fieldset>

      <p class="form-error" data-category-error role="alert" hidden></p>

      <div class="admin-form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create category' : 'Save changes'}</button>
        <button type="button" class="btn btn-light" data-cancel-category>Cancel</button>
      </div>
    </form>
  `;
}

/* --------------------------------------------------------------- content */

interface SettingField {
  key: keyof SiteSettings & string;
  label: string;
  type?: 'text' | 'textarea' | 'url';
  hint?: string;
}

interface SettingGroup {
  title: string;
  description: string;
  fields: SettingField[];
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    title: 'Announcement bar',
    description: 'A strip across the very top of the homepage. Leave it blank to hide it.',
    fields: [{ key: 'announcement', label: 'Message', type: 'text', hint: 'e.g. Free shipping this weekend only' }],
  },
  {
    title: 'Hero',
    description: 'The large panel at the top of the homepage.',
    fields: [
      { key: 'heroEyebrow', label: 'Eyebrow (small line above the heading)' },
      { key: 'heroTitle', label: 'Heading' },
      { key: 'heroSubtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'heroCtaPrimaryLabel', label: 'Primary button label' },
      { key: 'heroCtaPrimaryHref', label: 'Primary button link', type: 'url' },
      { key: 'heroCtaSecondaryLabel', label: 'Secondary button label' },
      { key: 'heroCtaSecondaryHref', label: 'Secondary button link', type: 'url' },
      { key: 'heroImage', label: 'Hero image URL', type: 'url' },
      { key: 'heroImageAlt', label: 'Hero image description (alt text)' },
    ],
  },
  {
    title: 'Trust badges',
    description: 'The three small promises under the hero buttons.',
    fields: [
      { key: 'feature1Title', label: 'Badge 1 title' },
      { key: 'feature1Text', label: 'Badge 1 text' },
      { key: 'feature2Title', label: 'Badge 2 title' },
      { key: 'feature2Text', label: 'Badge 2 text' },
      { key: 'feature3Title', label: 'Badge 3 title' },
      { key: 'feature3Text', label: 'Badge 3 text' },
    ],
  },
  {
    title: 'Featured section',
    description: 'The heading above the homepage product grid. Choose which products appear there with the “Homepage” switch on the Products tab.',
    fields: [
      { key: 'featuredSectionTitle', label: 'Section heading' },
      { key: 'featuredSectionLinkLabel', label: 'Link label' },
      { key: 'featuredSectionLinkHref', label: 'Link target', type: 'url' },
    ],
  },
  {
    title: 'Newsletter',
    description: 'The sign-up block near the bottom of the homepage.',
    fields: [
      { key: 'newsletterKicker', label: 'Kicker' },
      { key: 'newsletterTitle', label: 'Heading' },
      { key: 'newsletterText', label: 'Body', type: 'textarea' },
    ],
  },
  {
    title: 'Footer',
    description: 'The blurb beside the brand name.',
    fields: [{ key: 'footerBlurb', label: 'Footer blurb', type: 'textarea' }],
  },
];

export function renderSettingsForm(settings: SiteSettings, saved?: string[]): string {
  const savedSet = new Set(saved ?? []);

  return `
    <div class="admin-toolbar">
      <h2>Homepage content</h2>
      <div class="admin-toolbar-actions">
        <a class="btn btn-light" href="index.html" target="_blank" rel="noopener">Preview the homepage</a>
      </div>
    </div>

    <p class="admin-lede">
      These fields write straight to the live homepage. Text is inserted as plain text and
      links are validated, so nothing here can inject scripts.
    </p>

    <form class="admin-form" data-settings-form novalidate>
      ${SETTING_GROUPS.map(
        (group) => `
        <fieldset>
          <legend>${escapeHtml(group.title)}</legend>
          <p class="field-hint">${escapeHtml(group.description)}</p>
          ${group.fields
            .map((field) => {
              const value = settings[field.key] ?? '';
              const isSaved = savedSet.has(field.key);
              const input =
                field.type === 'textarea'
                  ? `<textarea name="${escapeAttr(field.key)}" rows="3">${escapeHtml(value)}</textarea>`
                  : `<input type="${field.type === 'url' ? 'url' : 'text'}"
                      name="${escapeAttr(field.key)}" value="${escapeAttr(value)}" />`;

              return `
              <label class="${isSaved ? 'just-saved' : ''}">
                <span>${escapeHtml(field.label)}${isSaved ? ' <em class="saved-flag">saved</em>' : ''}</span>
                ${input}
                ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ''}
              </label>`;
            })
            .join('')}
          <button type="button" class="btn btn-light btn-small"
            data-reset-group="${escapeAttr(group.fields.map((f) => f.key).join(','))}">
            Reset this section
          </button>
        </fieldset>`
      ).join('')}

      <p class="form-error" data-settings-error role="alert" hidden></p>

      <div class="admin-form-actions">
        <button type="submit" class="btn btn-primary">Save homepage content</button>
        <button type="button" class="btn btn-light" data-reset-all-settings>Reset everything</button>
      </div>
    </form>
  `;
}

/* ---------------------------------------------------------------- orders */

export const ORDER_STATUS_OPTIONS = [
  'pending_payment',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

export function renderOrdersTable(orders: AdminOrder[]): string {
  return `
    <div class="admin-toolbar">
      <h2>Orders <span class="admin-count">${orders.length}</span></h2>
    </div>

    ${
      orders.length
        ? `<div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Placed</th>
                  <th scope="col" class="num">Items</th>
                  <th scope="col" class="num">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(orderRow).join('')}
              </tbody>
            </table>
           </div>`
        : '<p class="admin-empty">No orders yet.</p>'
    }
  `;
}

function orderRow(order: AdminOrder): string {
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
  return `
    <tr>
      <td><span class="admin-id">${escapeHtml(order.id)}</span></td>
      <td>
        <strong>${escapeHtml(name)}</strong>
        <span class="admin-sub">${escapeHtml(order.email)}</span>
        <span class="admin-sub">${escapeHtml([order.city, order.country].filter(Boolean).join(', '))}</span>
      </td>
      <td>${escapeHtml(formatDate(order.created_at))}</td>
      <td class="num">${escapeHtml(order.item_count ?? 0)}</td>
      <td class="num">${formatCurrency(Number(order.total))}</td>
      <td>
        <label class="visually-hidden" for="status-${escapeAttr(order.id)}">Order status</label>
        <select id="status-${escapeAttr(order.id)}" data-order-status data-id="${escapeAttr(order.id)}">
          ${ORDER_STATUS_OPTIONS.map(
            (status) => `
            <option value="${escapeAttr(status)}" ${status === order.status ? 'selected' : ''}>
              ${escapeHtml(prettyStatus(status))}
            </option>`
          ).join('')}
        </select>
      </td>
    </tr>
  `;
}

/* ----------------------------------------------------------- subscribers */

export function renderSubscribers(subscribers: AdminSubscriber[]): string {
  const csv = subscribers.map((s) => s.email).join('\n');

  return `
    <div class="admin-toolbar">
      <h2>Newsletter subscribers <span class="admin-count">${subscribers.length}</span></h2>
      ${
        subscribers.length
          ? `<div class="admin-toolbar-actions">
              <button type="button" class="btn btn-light" data-copy-emails>Copy all emails</button>
             </div>`
          : ''
      }
    </div>

    ${
      subscribers.length
        ? `<textarea class="admin-csv" readonly rows="8" aria-label="Subscriber email addresses">${escapeHtml(
            csv
          )}</textarea>
           <ul class="admin-list">
             ${subscribers
               .slice(0, 100)
               .map(
                 (s) => `
               <li>
                 <span>${escapeHtml(s.email)}</span>
                 <span class="admin-sub">${escapeHtml(formatDate(s.created_at))}</span>
               </li>`
               )
               .join('')}
           </ul>
           ${subscribers.length > 100 ? `<p class="admin-empty">Showing the first 100 of ${subscribers.length}.</p>` : ''}`
        : '<p class="admin-empty">Nobody has signed up yet.</p>'
    }
  `;
}

/* ---------------------------------------------------------------- helpers */

export function prettyStatus(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Awaiting payment';
    case 'paid':
      return 'Paid';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** `linen-blend-blazer` style slug from a product name. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
