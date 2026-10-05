import {
  getFilteredProducts,
  getFilters,
  getPriceBounds,
  resetFilters,
  setFilters,
  subscribe as subscribeFilters,
  type FilterState,
} from './filters.ts';
import { loadCategories } from '@features/content/categories.ts';
import type { Category } from '@api/client.ts';
import { escapeAttr, escapeHtml } from '@utils/escape.ts';
import type { Product } from '@app-types/product.ts';

let searchInput: HTMLInputElement | null = null;
let categoryFilters: HTMLFieldSetElement | null = null;
let priceMinInput: HTMLInputElement | null = null;
let priceMaxInput: HTMLInputElement | null = null;
let inStockInput: HTMLInputElement | null = null;
let onSaleInput: HTMLInputElement | null = null;
let sortSelect: HTMLSelectElement | null = null;
let clearFiltersBtn: HTMLButtonElement | null = null;
let resultsCount: HTMLElement | null = null;
let filtersToggle: HTMLButtonElement | null = null;
let filtersPanel: HTMLElement | null = null;
let closeFiltersBtn: HTMLElement | null = null;
let filtersOverlay: HTMLElement | null = null;
let activeFiltersBar: HTMLElement | null = null;
let availableCategories: Category[] = [];

export function initSearchFilters(): void {
  searchInput = document.querySelector<HTMLInputElement>('#search-input');
  categoryFilters = document.querySelector<HTMLFieldSetElement>('#category-filters');
  priceMinInput = document.querySelector<HTMLInputElement>('#price-min');
  priceMaxInput = document.querySelector<HTMLInputElement>('#price-max');
  inStockInput = document.querySelector<HTMLInputElement>('#in-stock');
  onSaleInput = document.querySelector<HTMLInputElement>('#on-sale');
  sortSelect = document.querySelector<HTMLSelectElement>('#sort-by');
  clearFiltersBtn = document.querySelector<HTMLButtonElement>('#clear-filters');
  resultsCount = document.querySelector<HTMLElement>('#results-count');
  filtersToggle = document.querySelector<HTMLButtonElement>('#filters-toggle');
  filtersPanel = document.querySelector<HTMLElement>('#filters-panel');
  closeFiltersBtn = document.querySelector<HTMLElement>('#close-filters');
  filtersOverlay = document.querySelector<HTMLElement>('#filters-overlay');
  activeFiltersBar = document.querySelector<HTMLElement>('#active-filters');

  const hasControls = searchInput || categoryFilters || sortSelect || priceMinInput;
  if (!hasControls) return;

  if (!filtersOverlay && filtersPanel) {
    filtersOverlay = document.createElement('div');
    filtersOverlay.id = 'filters-overlay';
    filtersOverlay.className = 'filters-overlay';
    document.body.appendChild(filtersOverlay);
  }

  applyUrlParams();
  bindEvents();
  subscribeFilters(onFiltersChange);
  updateUIFromFilters(getFilters());
  updateResultsCount(getFilteredProducts().length);
  renderActiveFilters();

  // Categories come from the API so the list matches what the admin created.
  void loadCategories().then((categories) => {
    availableCategories = categories;
    renderCategoryCheckboxes();
    updateUIFromFilters(getFilters());
    renderActiveFilters();
  });
}

/** Supports `shop.html?q=linen` and `shop.html?category=Bags`. */
function applyUrlParams(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const patch: Partial<FilterState> = {};

  const query = urlParams.get('q');
  if (query) patch.query = query;

  const category = urlParams.get('category');
  if (category) patch.categories = [category];

  const sort = urlParams.get('sort');
  if (sort && ['name', 'price-asc', 'price-desc', 'newest'].includes(sort)) {
    patch.sortBy = sort as FilterState['sortBy'];
  }

  if (Object.keys(patch).length > 0) setFilters(patch);
}

function renderCategoryCheckboxes(): void {
  if (!categoryFilters) return;

  const categories = availableCategories.filter((c) => c.published);

  categoryFilters.innerHTML = `
    <legend>Categories</legend>
    ${
      categories.length
        ? categories
            .map(
              (c) => `
      <label class="filter-option">
        <input type="checkbox" value="${escapeAttr(c.name)}" />
        <span>${escapeHtml(c.name)}</span>
        <span class="filter-count">${escapeHtml(c.productCount)}</span>
      </label>`
            )
            .join('')
        : '<p class="filter-empty">No categories available yet.</p>'
    }
  `;
}

/**
 * The "Showing: Men ✕" chip. Makes a category-filtered page obvious and gives
 * a one-click way back to everything.
 */
function renderActiveFilters(): void {
  if (!activeFiltersBar) return;

  const filters = getFilters();
  const chips: string[] = [];

  filters.categories.forEach((name) => {
    chips.push(`
      <button type="button" class="filter-chip" data-clear-category="${escapeAttr(name)}">
        ${escapeHtml(name)}
        <span aria-hidden="true">×</span>
        <span class="visually-hidden">Stop filtering by ${escapeHtml(name)}</span>
      </button>`);
  });

  if (filters.inStock) {
    chips.push(`
      <button type="button" class="filter-chip" data-clear-flag="inStock">
        In stock <span aria-hidden="true">×</span>
        <span class="visually-hidden">Stop filtering by availability</span>
      </button>`);
  }
  if (filters.onSale) {
    chips.push(`
      <button type="button" class="filter-chip" data-clear-flag="onSale">
        On sale <span aria-hidden="true">×</span>
        <span class="visually-hidden">Stop filtering by sale</span>
      </button>`);
  }
  if (filters.query) {
    chips.push(`
      <button type="button" class="filter-chip" data-clear-flag="query">
        “${escapeHtml(filters.query)}” <span aria-hidden="true">×</span>
        <span class="visually-hidden">Clear the search term</span>
      </button>`);
  }

  activeFiltersBar.innerHTML = chips.join('');
}

function bindEvents(): void {
  searchInput?.addEventListener(
    'input',
    debounce(() => {
      setFilters({ query: searchInput?.value ?? '' });
    }, 300)
  );

  categoryFilters?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type !== 'checkbox') return;

    const current = getFilters();
    setFilters({
      categories: target.checked
        ? [...current.categories, target.value]
        : current.categories.filter((c) => c !== target.value),
    });
  });

  // An empty input, or one matching the catalogue's own span, means "no limit".
  const applyPriceInputs = (): void => {
    const [lo, hi] = getPriceBounds();
    const rawMin = priceMinInput?.value ?? '';
    const rawMax = priceMaxInput?.value ?? '';

    const min = rawMin === '' ? lo : clampPrice(rawMin);
    const max = rawMax === '' ? hi : clampPrice(rawMax, hi);

    if (min <= lo && max >= hi) {
      setFilters({ priceRange: null });
      return;
    }
    setFilters({ priceRange: [min, max] });
  };

  priceMinInput?.addEventListener('change', applyPriceInputs);
  priceMaxInput?.addEventListener('change', applyPriceInputs);

  inStockInput?.addEventListener('change', () => {
    setFilters({ inStock: Boolean(inStockInput?.checked) });
  });

  onSaleInput?.addEventListener('change', () => {
    setFilters({ onSale: Boolean(onSaleInput?.checked) });
  });

  sortSelect?.addEventListener('change', () => {
    setFilters({ sortBy: (sortSelect?.value ?? 'name') as FilterState['sortBy'] });
  });

  clearFiltersBtn?.addEventListener('click', () => {
    resetFilters();
    updateUIFromFilters(getFilters());
    renderActiveFilters();
  });

  activeFiltersBar?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;

    const categoryChip = target?.closest<HTMLButtonElement>('[data-clear-category]');
    if (categoryChip) {
      const name = categoryChip.dataset.clearCategory ?? '';
      setFilters({ categories: getFilters().categories.filter((c) => c !== name) });
      updateUIFromFilters(getFilters());
      return;
    }

    const flagChip = target?.closest<HTMLButtonElement>('[data-clear-flag]');
    if (flagChip) {
      const flag = flagChip.dataset.clearFlag;
      if (flag === 'query') setFilters({ query: '' });
      if (flag === 'inStock') setFilters({ inStock: false });
      if (flag === 'onSale') setFilters({ onSale: false });
      updateUIFromFilters(getFilters());
    }
  });

  // The "no results" state renders its own clear button.
  document.addEventListener('fashionhub:clear-filters', () => {
    resetFilters();
    updateUIFromFilters(getFilters());
    renderActiveFilters();
  });

  filtersToggle?.addEventListener('click', openFiltersPanel);
  closeFiltersBtn?.addEventListener('click', closeFiltersPanel);
  filtersOverlay?.addEventListener('click', closeFiltersPanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filtersPanel?.classList.contains('active')) closeFiltersPanel();
  });
}

function clampPrice(value: string | undefined, fallback?: number): number {
  const [lo, hi] = getPriceBounds();
  const parsed = Number(value);
  const target = fallback ?? lo;
  if (!Number.isFinite(parsed)) return target;
  return Math.min(Math.max(parsed, lo), hi);
}

function openFiltersPanel(): void {
  filtersPanel?.classList.add('active');
  filtersOverlay?.classList.add('active');
  filtersToggle?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeFiltersPanel(): void {
  filtersPanel?.classList.remove('active');
  filtersOverlay?.classList.remove('active');
  filtersToggle?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/**
 * Only the results count lives here — `features/products/render.ts` subscribes
 * to the same store and re-renders the grid itself.
 */
function onFiltersChange(_filters: FilterState, results: Product[]): void {
  updateResultsCount(results.length);
  renderActiveFilters();
}

function updateUIFromFilters(filters: FilterState): void {
  if (searchInput) searchInput.value = filters.query;

  // Show the catalogue's real span; the inputs only carry a value once the
  // shopper narrows it themselves.
  const [lo, hi] = getPriceBounds();
  if (priceMinInput) {
    priceMinInput.min = String(lo);
    priceMinInput.max = String(hi);
    priceMinInput.placeholder = String(lo);
    priceMinInput.value = filters.priceRange ? String(filters.priceRange[0]) : '';
  }
  if (priceMaxInput) {
    priceMaxInput.min = String(lo);
    priceMaxInput.max = String(hi);
    priceMaxInput.placeholder = String(hi);
    priceMaxInput.value = filters.priceRange ? String(filters.priceRange[1]) : '';
  }

  if (inStockInput) inStockInput.checked = filters.inStock;
  if (onSaleInput) onSaleInput.checked = filters.onSale;
  if (sortSelect) sortSelect.value = filters.sortBy;

  categoryFilters?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.checked = filters.categories.includes(cb.value);
  });
}

function updateResultsCount(count: number): void {
  if (resultsCount) {
    resultsCount.textContent = `${count} product${count === 1 ? '' : 's'} found`;
  }
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/** Re-render the category list once the catalogue has loaded from the API. */
export function refreshCategories(): void {
  renderCategoryCheckboxes();
  updateUIFromFilters(getFilters());
}
