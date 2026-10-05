import { getAllProducts, getProductCatalog } from './catalog.ts';
import type { Product } from '@app-types/product.ts';

export type SortOrder = 'name' | 'price-asc' | 'price-desc' | 'newest';

export interface FilterState {
  query: string;
  categories: string[];
  /**
   * `null` means "every price". A tuple is only set once the shopper narrows the
   * range themselves.
   *
   * This used to default to a hardcoded [0, 1000], which silently hid any
   * product priced above $1,000 from the shop AND the homepage featured grid.
   */
  priceRange: [number, number] | null;
  inStock: boolean;
  onSale: boolean;
  sortBy: SortOrder;
}

const defaultFilters: FilterState = {
  query: '',
  categories: [],
  priceRange: null,
  inStock: false,
  onSale: false,
  sortBy: 'name',
};

let currentFilters: FilterState = { ...defaultFilters };
let listeners: Array<(filters: FilterState, results: Product[]) => void> = [];

export function getFilters(): FilterState {
  return {
    ...currentFilters,
    categories: [...currentFilters.categories],
    priceRange: currentFilters.priceRange
      ? ([...currentFilters.priceRange] as [number, number])
      : null,
  };
}

/**
 * The real price span of the loaded catalogue, rounded outward. Drives the
 * min/max of the shop's price inputs and their placeholders.
 */
export function getPriceBounds(): [number, number] {
  const prices = getAllProducts()
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n));

  if (!prices.length) return [0, 1000];
  return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
}

export function setFilters(partial: Partial<FilterState>): void {
  currentFilters = { ...currentFilters, ...partial };
  notify();
}

export function toggleCategory(category: string): void {
  const has = currentFilters.categories.includes(category);
  currentFilters = {
    ...currentFilters,
    categories: has
      ? currentFilters.categories.filter((c) => c !== category)
      : [...currentFilters.categories, category],
  };
  notify();
}

export function resetFilters(): void {
  currentFilters = { ...defaultFilters, categories: [], priceRange: null };
  notify();
}

export function subscribe(fn: (filters: FilterState, results: Product[]) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function notify(): void {
  const results = getFilteredProducts();
  const snapshot = getFilters();
  listeners.forEach((fn) => fn(snapshot, results));
}

function matchesQuery(product: Product, query: string): boolean {
  const q = query.toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    (product.description ?? '').toLowerCase().includes(q) ||
    (product.category ?? '').toLowerCase().includes(q) ||
    (product.features ?? []).some((f) => f.toLowerCase().includes(q))
  );
}

function isOnSale(product: Product): boolean {
  return typeof product.oldPrice === 'number' && product.oldPrice > product.price;
}

function inStock(product: Product): boolean {
  // `stock` is optional: products loaded from an old cache may not carry it.
  return product.stock === undefined || product.stock > 0;
}

function timestamp(product: Product): number {
  const parsed = product.createdAt ? Date.parse(product.createdAt) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function applyFilters(products: Product[], filters: FilterState): Product[] {
  const range = filters.priceRange;
  // A null range imposes no limit at all; otherwise honour it even if the two
  // numbers were entered the wrong way round.
  const low = range ? Math.min(range[0], range[1]) : -Infinity;
  const high = range ? Math.max(range[0], range[1]) : Infinity;

  const result = products.filter((p) => {
    if (filters.query && !matchesQuery(p, filters.query)) return false;

    if (filters.categories.length > 0) {
      const category = (p.category ?? '').toLowerCase();
      const wanted = filters.categories.map((c) => c.toLowerCase());
      if (!category || !wanted.includes(category)) return false;
    }

    if (range && (p.price < low || p.price > high)) return false;
    if (filters.inStock && !inStock(p)) return false;
    if (filters.onSale && !isOnSale(p)) return false;

    return true;
  });

  // Keep the catalogue's own order as the tie-breaker so sorts are stable.
  const order = new Map(products.map((p, index) => [p.id, index]));
  const indexOf = (p: Product) => order.get(p.id) ?? 0;

  result.sort((a, b) => {
    switch (filters.sortBy) {
      case 'price-asc':
        return a.price - b.price || a.name.localeCompare(b.name);
      case 'price-desc':
        return b.price - a.price || a.name.localeCompare(b.name);
      case 'newest':
        return timestamp(b) - timestamp(a) || indexOf(b) - indexOf(a);
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return result;
}

export function getFilteredProducts(): Product[] {
  return applyFilters(getAllProducts(), currentFilters);
}

/** Category names that actually exist in the current catalogue, with counts. */
export function getAvailableCategories(): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const product of Object.values(getProductCatalog())) {
    const name = (product.category ?? '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export { isOnSale, inStock };
