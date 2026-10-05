import '@styles/main.css';

import { bootstrapCommon, onReady } from '../bootstrap.ts';
import { getUser, isAdmin, isSignedIn, login, logout, registerAdmin } from '@features/auth/session.ts';
import {
  api,
  ApiError,
  type AdminOrder,
  type AdminProduct,
  type AdminStats,
  type AdminSubscriber,
  type AdminSetupStatus,
  type AdminUser,
  type Category,
} from '@api/client.ts';
import type { SiteSettings } from '@features/content/siteSettings.ts';
import { showToast } from '@components/ui/Toast.ts';
import { escapeAttr } from '@utils/escape.ts';
import {
  categoryToForm,
  emptyCategoryForm,
  emptyProductForm,
  productToForm,
  renderCategoriesTable,
  renderCategoryForm,
  renderDashboard,
  renderGate,
  renderOrdersTable,
  renderProductForm,
  renderProductTable,
  renderSettingsForm,
  renderShell,
  renderSubscribers,
  renderTeam,
  renderVariantMatrix,
  slugify,
  type AdminTab,
  type CategoryFormState,
  type GateMode,
  type ProductFormState,
} from '@features/admin/views.ts';
import { loadCategories } from '@features/content/categories.ts';

const root = document.querySelector<HTMLElement>('#admin-root');

interface EditorState {
  form: ProductFormState;
  isNew: boolean;
  sizes: string[];
  colors: string[];
  variantStock: Record<string, number>;
  matrixBuilt: boolean;
}

interface AdminState {
  tab: AdminTab;
  products: AdminProduct[];
  productQuery: string;
  editor: EditorState | null;
  settings: SiteSettings | null;
  savedKeys: string[];
  orders: AdminOrder[];
  subscribers: AdminSubscriber[];
  stats: AdminStats | null;
  users: AdminUser[];
  categories: Category[];
  categoryEditor: { form: CategoryFormState; isNew: boolean } | null;
  gateMode: GateMode;
  gateStatus: AdminSetupStatus | null;
  gateError?: string;
}

const state: AdminState = {
  tab: 'dashboard',
  products: [],
  productQuery: '',
  editor: null,
  settings: null,
  savedKeys: [],
  orders: [],
  subscribers: [],
  stats: null,
  users: [],
  categories: [],
  categoryEditor: null,
  gateMode: 'signin',
  gateStatus: null,
};

/* ================================
   Rendering
================================ */

function render(): void {
  if (!root) return;

  if (!isSignedIn() || !isAdmin()) {
    root.innerHTML = renderGate(state.gateStatus, state.gateMode, state.gateError);
    bindGate();
    return;
  }

  const user = getUser();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Admin';

  root.innerHTML = renderShell(state.tab, name);
  bindShell();

  const panel = root.querySelector<HTMLElement>('[data-panel]');
  if (!panel) return;

  if (state.editor) {
    panel.innerHTML = renderProductForm(state.editor.form, state.editor.isNew);
    bindProductForm(panel);
    if (state.editor.matrixBuilt) renderMatrix(panel);
    void loadCategoryOptions(panel);
    return;
  }

  if (state.categoryEditor) {
    panel.innerHTML = renderCategoryForm(state.categoryEditor.form, state.categoryEditor.isNew);
    bindCategoryForm(panel);
    return;
  }

  switch (state.tab) {
    case 'dashboard':
      panel.innerHTML = state.stats
        ? renderDashboard(state.stats) +
          renderTeam(state.users, getUser()?.id)
        : '<p class="admin-loading">Loading…</p>';
      bindDashboard(panel);
      break;
    case 'products':
      panel.innerHTML = state.products.length
        ? renderProductTable(state.products, state.productQuery)
        : '<p class="admin-loading">Loading…</p>';
      bindProductTable(panel);
      break;
    case 'categories':
      panel.innerHTML = renderCategoriesTable(state.categories);
      bindCategoriesTable(panel);
      break;
    case 'content':
      panel.innerHTML = state.settings
        ? renderSettingsForm(state.settings, state.savedKeys)
        : '<p class="admin-loading">Loading…</p>';
      bindSettings(panel);
      break;
    case 'orders':
      panel.innerHTML = state.orders.length
        ? renderOrdersTable(state.orders)
        : '<p class="admin-loading">Loading…</p>';
      bindOrders(panel);
      break;
    case 'subscribers':
      panel.innerHTML = renderSubscribers(state.subscribers);
      bindSubscribers(panel);
      break;
  }
}

function renderPanel(html: string): void {
  const panel = root?.querySelector<HTMLElement>('[data-panel]');
  if (panel) panel.innerHTML = html;
}

/* ================================
   Data loading
================================ */

async function loadTab(tab: AdminTab): Promise<void> {
  try {
    switch (tab) {
      case 'dashboard':
        // Stats and the team list are independent; load both.
        [state.stats, state.users] = await Promise.all([
          api.admin.stats(),
          api.admin.users().catch((error) => {
            console.warn('Could not load the team list:', error);
            return [] as AdminUser[];
          }),
        ]);
        break;
      case 'products':
        state.products = await api.admin.products();
        break;
      case 'categories':
        state.categories = await api.admin.categories();
        break;
      case 'content': {
        const res = await api.admin.settings();
        state.settings = res.settings;
        break;
      }
      case 'orders':
        state.orders = await api.admin.orders();
        break;
      case 'subscribers':
        state.subscribers = await api.admin.subscribers();
        break;
    }
  } catch (error) {
    console.error(`Could not load the ${tab} tab:`, error);
    showToast(messageFor(error, 'Could not load that section.'));
    renderPanel('<p class="admin-empty">Could not load this section. Try again.</p>');
    return;
  }
  render();
}

async function loadCategoryOptions(panel: HTMLElement): Promise<void> {
  const list = panel.querySelector<HTMLDataListElement>('#category-options');
  if (!list) return;

  try {
    const categories = await api.products.categories();
    list.innerHTML = categories.map((c) => `<option value="${escapeAttr(c.name)}"></option>`).join('');
  } catch {
    /* the datalist is a convenience; failing quietly is fine */
  }
}

/* ================================
   Gate
================================ */

function bindGate(): void {
  const form = root?.querySelector<HTMLFormElement>('[data-gate-form]');
  form?.addEventListener('submit', (event) => void handleGateSubmit(event, form));

  root?.querySelector<HTMLButtonElement>('[data-gate-create]')?.addEventListener('click', () => {
    state.gateMode = 'create';
    state.gateError = undefined;
    render();
  });

  root?.querySelector<HTMLButtonElement>('[data-gate-back]')?.addEventListener('click', () => {
    state.gateMode = 'signin';
    state.gateError = undefined;
    render();
  });

  const createForm = root?.querySelector<HTMLFormElement>('[data-create-admin-form]');
  createForm?.addEventListener('submit', (event) => void handleCreateAdmin(event, createForm));
}

async function loadGateStatus(): Promise<void> {
  try {
    state.gateStatus = await api.auth.adminSetup();
  } catch (error) {
    console.warn('Could not read the admin setup status:', error);
    state.gateStatus = null;
  }
}

async function handleCreateAdmin(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
  event.preventDefault();

  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const setupKey = String(data.get('setupKey') ?? '').trim();
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!email || !password) {
    state.gateError = 'Enter an email and a password.';
    render();
    return;
  }
  if (password.length < 8) {
    state.gateError = 'Your password must be at least 8 characters.';
    render();
    return;
  }

  if (submit) submit.disabled = true;

  try {
    const user = await registerAdmin({
      email,
      password,
      firstName: String(data.get('firstName') ?? '').trim() || undefined,
      lastName: String(data.get('lastName') ?? '').trim() || undefined,
      setupKey: setupKey || undefined,
    });

    if (!isAdmin()) {
      state.gateError = 'That account was created but did not receive admin access.';
      render();
      return;
    }

    showToast(`Welcome, ${user.firstName || user.email} — you have full admin access.`);
    state.gateError = undefined;
    state.gateMode = 'signin';
    state.tab = 'dashboard';
    render();
    await loadTab('dashboard');
  } catch (error) {
    state.gateError = messageFor(error, 'Could not create the admin account.');
    render();
  }
}

async function handleGateSubmit(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
  event.preventDefault();

  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!email || !password) {
    state.gateError = 'Enter your email and password.';
    render();
    return;
  }

  if (submit) submit.disabled = true;

  try {
    await login(email, password);

    if (!isAdmin()) {
      logout();
      state.gateError = 'That account does not have admin access.';
      render();
      return;
    }

    state.gateError = undefined;
    state.tab = 'dashboard';
    render();
    await loadTab('dashboard');
  } catch (error) {
    state.gateError = messageFor(error, 'Sign in failed. Please try again.');
    render();
  }
}

/* ================================
   Shell
================================ */

function bindShell(): void {
  root?.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const next = tab.dataset.tab as AdminTab;
      if (next === state.tab && !state.editor) return;
      state.tab = next;
      state.editor = null;
      state.categoryEditor = null;
      state.savedKeys = [];
      render();
      void loadTab(next);
    });
  });

  root?.querySelector<HTMLButtonElement>('[data-admin-sign-out]')?.addEventListener('click', () => {
    logout();
    showToast('Signed out of the admin panel.');
    render();
  });
}

/* ================================
   Dashboard
================================ */

function bindDashboard(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => void openEditor(button.dataset.editProduct ?? ''));
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-set-role]').forEach((button) => {
    button.addEventListener('click', () =>
      void setRole(
        Number(button.dataset.setRole),
        (button.dataset.role as 'admin' | 'customer') ?? 'customer',
        button
      )
    );
  });
}

async function setRole(id: number, role: 'admin' | 'customer', button: HTMLButtonElement): Promise<void> {
  if (!Number.isFinite(id)) return;

  const target = state.users.find((u) => u.id === id);
  if (role === 'customer' && target) {
    const confirmed = window.confirm(
      `Remove admin access for ${target.email}?\n\nThey will lose access to this panel immediately.`
    );
    if (!confirmed) return;
  }

  button.disabled = true;
  try {
    const res = await api.admin.setUserRole(id, role);
    showToast(res.message);
    state.users = await api.admin.users();
    render();
  } catch (error) {
    button.disabled = false;
    showToast(messageFor(error, 'Could not change that account.'));
  }
}

/* ================================
   Products
================================ */

function bindProductTable(panel: HTMLElement): void {
  const search = panel.querySelector<HTMLInputElement>('[data-product-search]');
  search?.addEventListener('input', () => {
    state.productQuery = search.value;
    // Re-render just the table so the input keeps focus.
    const wrap = panel;
    const selectionStart = search.selectionStart;
    wrap.innerHTML = renderProductTable(state.products, state.productQuery);
    bindProductTable(wrap);
    const next = wrap.querySelector<HTMLInputElement>('[data-product-search]');
    next?.focus();
    if (selectionStart != null) next?.setSelectionRange(selectionStart, selectionStart);
  });

  panel.querySelector<HTMLButtonElement>('[data-new-product]')?.addEventListener('click', () => {
    state.editor = {
      form: emptyProductForm(),
      isNew: true,
      sizes: [],
      colors: [],
      variantStock: {},
      matrixBuilt: false,
    };
    render();
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => void openEditor(button.dataset.editProduct ?? ''));
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', () => void deleteProduct(button.dataset.deleteProduct ?? '', panel));
  });

  panel.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
    input.addEventListener('change', () =>
      void toggleProductFlag(input.dataset.id ?? '', input.dataset.toggle ?? '', input.checked, input)
    );
  });
}

async function toggleProductFlag(
  id: string,
  field: string,
  value: boolean,
  input: HTMLInputElement
): Promise<void> {
  if (!id || (field !== 'published' && field !== 'featured')) return;

  input.disabled = true;
  try {
    const updated = await api.admin.saveProduct({ id, [field]: value });
    const index = state.products.findIndex((p) => p.id === id);
    if (index >= 0) state.products[index] = updated;

    showToast(
      field === 'published'
        ? value
          ? `${updated.name} is now live on the site.`
          : `${updated.name} is hidden from the site.`
        : value
          ? `${updated.name} is featured on the homepage.`
          : `${updated.name} is no longer featured.`
    );
    state.stats = null; // counts changed
  } catch (error) {
    input.checked = !value;
    showToast(messageFor(error, 'Could not save that change.'));
  } finally {
    input.disabled = false;
  }
}

async function deleteProduct(id: string, panel: HTMLElement): Promise<void> {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  const confirmed = window.confirm(
    `Delete “${product.name}”?\n\nThis cannot be undone. Products that appear in past orders cannot be deleted — hide them instead.`
  );
  if (!confirmed) return;

  try {
    await api.admin.deleteProduct(id);
    state.products = state.products.filter((p) => p.id !== id);
    state.stats = null;
    showToast(`${product.name} was deleted.`);
    renderPanel(renderProductTable(state.products, state.productQuery));
    bindProductTable(panel);
  } catch (error) {
    showToast(messageFor(error, 'Could not delete that product.'));
  }
}

/* ================================
   Product editor
================================ */

async function openEditor(id: string): Promise<void> {
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    showToast('That product is no longer in the list.');
    return;
  }

  let sizes: string[] = [];
  let colors: string[] = [];
  const variantStock: Record<string, number> = {};

  try {
    const variants = await api.products.variants(id);
    sizes = unique(variants.map((v) => v.size));
    colors = unique(variants.map((v) => v.color));
    variants.forEach((v) => {
      if (v.size && v.color) variantStock[`${v.size}|${v.color}`] = Number(v.stock);
    });
  } catch (error) {
    console.warn('Could not load variants:', error);
  }

  state.editor = {
    form: productToForm(product, sizes, colors),
    isNew: false,
    sizes,
    colors,
    variantStock,
    matrixBuilt: sizes.length > 0 && colors.length > 0,
  };
  render();
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function bindProductForm(panel: HTMLElement): void {
  const form = panel.querySelector<HTMLFormElement>('[data-product-form]');
  if (!form) return;

  // Auto-generate the slug from the name for new products only.
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
  const idInput = form.querySelector<HTMLInputElement>('input[name="id"]');
  if (state.editor?.isNew) {
    nameInput?.addEventListener('input', () => {
      if (idInput && !idInput.dataset.touched) idInput.value = slugify(nameInput.value);
    });
    idInput?.addEventListener('input', () => {
      idInput.dataset.touched = 'true';
    });
  }

  // Main image: URL field + upload + live preview.
  const imageInput = form.querySelector<HTMLInputElement>('[data-image-input]');
  const imagePreview = form.querySelector<HTMLImageElement>('[data-image-preview]');
  const imageUpload = form.querySelector<HTMLInputElement>('[data-image-upload]');

  imageInput?.addEventListener('input', () => {
    if (!imagePreview) return;
    const url = imageInput.value.trim();
    imagePreview.src = url;
    imagePreview.hidden = !url;
  });

  imageUpload?.addEventListener('change', () =>
    void handleUpload(imageUpload, (url) => {
      if (imageInput) imageInput.value = url;
      if (imagePreview) {
        imagePreview.src = url;
        imagePreview.hidden = false;
      }
    })
  );

  // Gallery.
  panel.querySelector<HTMLButtonElement>('[data-gallery-add]')?.addEventListener('click', () => {
    const input = panel.querySelector<HTMLInputElement>('[data-gallery-input]');
    const url = input?.value.trim();
    if (!url) {
      showToast('Enter an image URL first.');
      return;
    }
    addGalleryImage(panel, url);
    if (input) input.value = '';
  });

  panel.querySelector<HTMLInputElement>('[data-gallery-upload]')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    void handleUpload(input, (url) => addGalleryImage(panel, url));
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-gallery-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('[data-gallery-item]')?.remove();
      refreshGalleryEmptyState(panel);
    });
  });

  // Variant matrix.
  panel.querySelector<HTMLButtonElement>('[data-build-matrix]')?.addEventListener('click', () => {
    buildMatrix(panel);
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-cancel-product]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editor = null;
      render();
      void loadTab('products');
    });
  });

  form.addEventListener('submit', (event) => void handleProductSubmit(event, form, panel));
}

function addGalleryImage(panel: HTMLElement, url: string): void {
  const list = panel.querySelector<HTMLElement>('[data-gallery-list]');
  if (!list) return;

  const existing = [...list.querySelectorAll<HTMLInputElement>('input[name="gallery"]')].map((i) => i.value);
  if (existing.includes(url)) {
    showToast('That image is already in the gallery.');
    return;
  }
  if (existing.length >= 6) {
    showToast('The gallery holds at most 6 images.');
    return;
  }

  list.querySelector('.admin-empty')?.remove();

  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.galleryItem = '';
  item.innerHTML = `
    <img src="${escapeAttr(url)}" alt="" loading="lazy" decoding="async" />
    <input type="hidden" name="gallery" value="${escapeAttr(url)}" />
    <button type="button" class="gallery-remove" data-gallery-remove aria-label="Remove image">×</button>
  `;
  item.querySelector<HTMLButtonElement>('[data-gallery-remove]')?.addEventListener('click', () => {
    item.remove();
    refreshGalleryEmptyState(panel);
  });
  list.appendChild(item);
}

function refreshGalleryEmptyState(panel: HTMLElement): void {
  const list = panel.querySelector<HTMLElement>('[data-gallery-list]');
  if (!list) return;
  if (list.querySelector('[data-gallery-item]')) return;
  list.innerHTML = '<p class="admin-empty">No extra images yet.</p>';
}

async function handleUpload(input: HTMLInputElement, onUrl: (url: string) => void): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;

  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
    showToast('Use a PNG, JPEG, WebP, GIF or AVIF image.');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Images must be under 5 MB.');
    input.value = '';
    return;
  }

  try {
    showToast('Uploading…');
    const { url } = await api.admin.uploadImage(file);
    onUrl(url);
    showToast('Image uploaded.');
  } catch (error) {
    showToast(messageFor(error, 'Upload failed.'));
  } finally {
    input.value = '';
  }
}

function readMatrix(panel: HTMLElement): Array<{ size: string; color: string; stock: number }> {
  return [...panel.querySelectorAll<HTMLInputElement>('.variant-stock')].map((input) => ({
    size: input.dataset.size ?? '',
    color: input.dataset.color ?? '',
    stock: Math.max(0, Number(input.value) || 0),
  }));
}

function buildMatrix(panel: HTMLElement): void {
  if (!state.editor) return;

  const sizes = splitList(panel.querySelector<HTMLInputElement>('[data-variant-sizes]')?.value ?? '');
  const colors = splitList(panel.querySelector<HTMLInputElement>('[data-variant-colors]')?.value ?? '');

  // Carry over any stock already typed so rebuilding the grid doesn't lose work.
  const previous: Record<string, number> = {};
  panel.querySelectorAll<HTMLInputElement>('.variant-stock').forEach((input) => {
    const key = `${input.dataset.size}|${input.dataset.color}`;
    previous[key] = Number(input.value) || 0;
  });

  state.editor.sizes = sizes;
  state.editor.colors = colors;
  state.editor.variantStock = { ...state.editor.variantStock, ...previous };
  state.editor.matrixBuilt = true;

  renderMatrix(panel);
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function renderMatrix(panel: HTMLElement): void {
  if (!state.editor) return;
  const holder = panel.querySelector<HTMLElement>('[data-variant-matrix]');
  if (!holder) return;

  holder.innerHTML = renderVariantMatrix(
    state.editor.sizes,
    state.editor.colors,
    state.editor.variantStock
  );
}

async function handleProductSubmit(
  event: SubmitEvent,
  form: HTMLFormElement,
  panel: HTMLElement
): Promise<void> {
  event.preventDefault();
  if (!state.editor) return;

  const errorEl = form.querySelector<HTMLElement>('[data-product-error]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const data = new FormData(form);

  const id = String(data.get('id') ?? '').trim();
  const name = String(data.get('name') ?? '').trim();
  const priceRaw = String(data.get('price') ?? '').trim();

  if (errorEl) errorEl.hidden = true;

  if (!name) return showProductError(errorEl, 'A product needs a name.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return showProductError(errorEl, 'The slug must be lowercase letters, numbers and dashes.');
  }
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    return showProductError(errorEl, 'Enter a valid price.');
  }

  const oldPriceRaw = String(data.get('old_price') ?? '').trim();
  const oldPrice = oldPriceRaw === '' ? null : Number(oldPriceRaw);
  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) {
    return showProductError(errorEl, 'The sale price must be a number.');
  }

  const gallery = [...form.querySelectorAll<HTMLInputElement>('input[name="gallery"]')].map((i) => i.value);

  const payload = {
    id,
    name,
    price,
    old_price: oldPrice,
    image: String(data.get('image') ?? '').trim(),
    description: String(data.get('description') ?? '').trim(),
    features: String(data.get('features') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    rating: String(data.get('rating') ?? '').trim() || null,
    reviews: String(data.get('reviews') ?? '').trim() || null,
    category: String(data.get('category') ?? '').trim() || null,
    stock: Math.max(0, Number(data.get('stock')) || 0),
    gallery,
    published: form.querySelector<HTMLInputElement>('input[name="published"]')?.checked ?? true,
    featured: form.querySelector<HTMLInputElement>('input[name="featured"]')?.checked ?? false,
  };

  if (submit) submit.disabled = true;

  try {
    await api.admin.saveProduct(payload);

    const variants = state.editor.matrixBuilt ? readMatrix(panel) : [];
    if (variants.length) {
      await api.admin.replaceVariants(id, variants);
    }

    showToast(state.editor.isNew ? `${name} was created.` : `${name} was saved.`);
    state.editor = null;
    state.stats = null;
    void loadCategories(true); // a new category may have been auto-created
    render();
    await loadTab('products');
  } catch (error) {
    showProductError(errorEl, messageFor(error, 'Could not save that product.'));
    if (submit) submit.disabled = false;
  }
}

function showProductError(el: HTMLElement | null, message: string): void {
  if (el) {
    el.textContent = message;
    el.hidden = false;
  } else {
    showToast(message);
  }
}

/* ================================
   Categories
================================ */

function bindCategoriesTable(panel: HTMLElement): void {
  panel.querySelector<HTMLButtonElement>('[data-new-category]')?.addEventListener('click', () => {
    state.categoryEditor = { form: emptyCategoryForm(), isNew: true };
    render();
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-edit-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.editCategory);
      const category = state.categories.find((c) => c.id === id);
      if (!category) return;
      state.categoryEditor = { form: categoryToForm(category), isNew: false };
      render();
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-delete-category]').forEach((button) => {
    button.addEventListener('click', () => void deleteCategory(Number(button.dataset.deleteCategory)));
  });

  panel.querySelectorAll<HTMLInputElement>('[data-toggle-category]').forEach((input) => {
    input.addEventListener('change', () =>
      void toggleCategoryPublished(Number(input.dataset.toggleCategory), input.checked, input)
    );
  });
}

async function toggleCategoryPublished(id: number, published: boolean, input: HTMLInputElement): Promise<void> {
  if (!Number.isFinite(id)) return;
  input.disabled = true;
  try {
    const updated = await api.admin.updateCategory(id, { published });
    state.categories = state.categories.map((c) => (c.id === id ? updated : c));
    void loadCategories(true);
    showToast(
      published
        ? `${updated.name} is live on the site.`
        : `${updated.name} is hidden from tiles, filters and navigation.`
    );
  } catch (error) {
    input.checked = !published;
    showToast(messageFor(error, 'Could not save that change.'));
  } finally {
    input.disabled = false;
  }
}

async function deleteCategory(id: number): Promise<void> {
  const category = state.categories.find((c) => c.id === id);
  if (!category) return;

  if (!window.confirm(`Delete the "${category.name}" collection?\n\nCategories that still contain products cannot be deleted — hide them instead.`)) {
    return;
  }

  try {
    await api.admin.deleteCategory(id);
    state.categories = state.categories.filter((c) => c.id !== id);
    void loadCategories(true);
    showToast(`${category.name} was deleted.`);
    render();
  } catch (error) {
    showToast(messageFor(error, 'Could not delete that category.'));
  }
}

function bindCategoryForm(panel: HTMLElement): void {
  const form = panel.querySelector<HTMLFormElement>('[data-category-form]');
  if (!form) return;

  // Slug follows the name until touched.
  if (state.categoryEditor?.isNew) {
    const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
    const slugInput = form.querySelector<HTMLInputElement>('input[name="slug"]');
    nameInput?.addEventListener('input', () => {
      if (slugInput && !slugInput.dataset.touched) slugInput.value = slugify(nameInput.value);
    });
    slugInput?.addEventListener('input', () => {
      slugInput.dataset.touched = 'true';
    });
  }

  const imageInput = form.querySelector<HTMLInputElement>('[data-category-image-input]');
  const preview = panel.querySelector<HTMLImageElement>('[data-category-preview]');
  imageInput?.addEventListener('input', () => {
    if (!preview) return;
    const url = imageInput.value.trim();
    preview.src = url;
    preview.hidden = !url;
  });

  panel.querySelector<HTMLInputElement>('[data-category-upload]')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    void handleUpload(input, (url) => {
      if (imageInput) imageInput.value = url;
      if (preview) {
        preview.src = url;
        preview.hidden = false;
      }
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-cancel-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.categoryEditor = null;
      render();
      void loadTab('categories');
    });
  });

  form.addEventListener('submit', (event) => void handleCategorySubmit(event, form));
}

async function handleCategorySubmit(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
  event.preventDefault();
  if (!state.categoryEditor) return;

  const errorEl = form.querySelector<HTMLElement>('[data-category-error]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const data = new FormData(form);

  const name = String(data.get('name') ?? '').trim();
  if (errorEl) errorEl.hidden = true;
  if (!name) {
    if (errorEl) {
      errorEl.textContent = 'A category needs a name.';
      errorEl.hidden = false;
    }
    return;
  }

  const payload = {
    name,
    slug: String(data.get('slug') ?? '').trim() || undefined,
    description: String(data.get('description') ?? '').trim() || undefined,
    image: String(data.get('image') ?? '').trim() || null,
    sortOrder: String(data.get('sortOrder') ?? '').trim() === ''
      ? undefined
      : Number(data.get('sortOrder')),
    published: form.querySelector<HTMLInputElement>('input[name="published"]')?.checked ?? true,
  };

  if (submit) submit.disabled = true;

  try {
    const saved = state.categoryEditor.isNew
      ? await api.admin.createCategory(payload)
      : await api.admin.updateCategory(state.categoryEditor.form.id ?? 0, payload);

    showToast(state.categoryEditor.isNew ? `${saved.name} created.` : `${saved.name} saved.`);
    state.categoryEditor = null;
    state.stats = null;
    void loadCategories(true);
    render();
    await loadTab('categories');
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = messageFor(error, 'Could not save that category.');
      errorEl.hidden = false;
    }
    if (submit) submit.disabled = false;
  }
}

/* ================================
   Homepage content
================================ */

function bindSettings(panel: HTMLElement): void {
  const form = panel.querySelector<HTMLFormElement>('[data-settings-form]');

  form?.addEventListener('submit', (event) => void handleSettingsSubmit(event, form));

  panel.querySelectorAll<HTMLButtonElement>('[data-reset-group]').forEach((button) => {
    button.addEventListener('click', () =>
      void resetSettings(splitList(button.dataset.resetGroup ?? ''), button)
    );
  });

  panel.querySelector<HTMLButtonElement>('[data-reset-all-settings]')?.addEventListener('click', () => {
    if (!window.confirm('Reset every homepage field back to its default?')) return;
    void resetSettings(undefined);
  });
}

async function handleSettingsSubmit(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
  event.preventDefault();

  const errorEl = form.querySelector<HTMLElement>('[data-settings-error]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (errorEl) errorEl.hidden = true;

  const patch: Partial<SiteSettings> = {};
  new FormData(form).forEach((value, key) => {
    patch[key] = String(value);
  });

  if (submit) submit.disabled = true;

  try {
    const res = await api.admin.saveSettings(patch);
    state.settings = res.settings;
    state.savedKeys = res.applied;
    showToast(`Saved ${res.applied.length} field${res.applied.length === 1 ? '' : 's'}.`);
    render();
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = messageFor(error, 'Could not save your changes.');
      errorEl.hidden = false;
    }
    if (submit) submit.disabled = false;
  }
}

async function resetSettings(keys: string[] | undefined, button?: HTMLButtonElement): Promise<void> {
  if (button) button.disabled = true;
  try {
    const res = await api.admin.resetSettings(keys);
    state.settings = res.settings;
    state.savedKeys = [];
    showToast(`Reset ${res.reset.length} field${res.reset.length === 1 ? '' : 's'}.`);
    render();
  } catch (error) {
    showToast(messageFor(error, 'Could not reset those fields.'));
    if (button) button.disabled = false;
  }
}

/* ================================
   Orders & subscribers
================================ */

function bindOrders(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLSelectElement>('[data-order-status]').forEach((select) => {
    select.addEventListener('change', () =>
      void updateOrderStatus(select.dataset.id ?? '', select.value, select)
    );
  });
}

async function updateOrderStatus(id: string, status: string, select: HTMLSelectElement): Promise<void> {
  if (!id) return;
  select.disabled = true;

  try {
    const updated = await api.admin.setOrderStatus(id, status);
    const index = state.orders.findIndex((o) => o.id === id);
    if (index >= 0) state.orders[index] = { ...state.orders[index], status: updated.status };
    state.stats = null;
    showToast(`${id} marked as ${status.replace('_', ' ')}.`);
  } catch (error) {
    showToast(messageFor(error, 'Could not update that order.'));
    await loadTab('orders');
    return;
  } finally {
    select.disabled = false;
  }
}

function bindSubscribers(panel: HTMLElement): void {
  panel.querySelector<HTMLButtonElement>('[data-copy-emails]')?.addEventListener('click', async () => {
    const emails = state.subscribers.map((s) => s.email).join('\n');
    try {
      await navigator.clipboard.writeText(emails);
      showToast(`Copied ${state.subscribers.length} email addresses.`);
    } catch {
      showToast('Your browser blocked the clipboard — select the text box instead.');
    }
  });
}

/* ================================
   Helpers
================================ */

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return error.serverMessage ?? 'Your account does not have admin access.';
    }
    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 409) return error.serverMessage ?? 'That account already exists.';

    const fieldErrors = (error.data as { errors?: { fieldErrors?: Record<string, string[]> } })
      ?.errors?.fieldErrors;
    if (fieldErrors) {
      const [field, messages] = Object.entries(fieldErrors)[0] ?? [];
      if (field && messages?.length) return `${field}: ${messages[0]}`;
    }
    return error.serverMessage ?? fallback;
  }
  return fallback;
}

/* ================================
   Boot
================================ */

async function boot(): Promise<void> {
  await bootstrapCommon();

  // Deep-link support: admin.html#products lands on that tab.
  const hash = window.location.hash.replace('#', '') as AdminTab;
  if (hash && ['dashboard', 'products', 'content', 'orders', 'subscribers'].includes(hash)) {
    state.tab = hash;
  }

  if (isSignedIn() && !isAdmin()) {
    state.gateError = 'That account does not have admin access. Sign in with an admin account.';
    logout();
  }

  if (!isSignedIn() || !isAdmin()) {
    await loadGateStatus();
    // No admin yet? Skip straight to the create form — that is what they came for.
    if (state.gateStatus?.firstRun && state.gateStatus.canCreateAdmin) {
      state.gateMode = 'create';
    }
  }

  render();

  if (isSignedIn() && isAdmin()) await loadTab(state.tab);
}

onReady(() => void boot());
