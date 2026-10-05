import { describe, expect, it } from 'vitest';
import { applyFilters, type FilterState } from './filters.ts';
import type { Product } from '@app-types/product.ts';

const base: FilterState = {
  query: '',
  categories: [],
  priceRange: null, // "every price" — what the shop uses until the shopper narrows it
  inStock: false,
  onSale: false,
  sortBy: 'name',
};

const product = (overrides: Partial<Product>): Product => ({
  id: 'x',
  name: 'X',
  price: 10,
  image: '',
  description: '',
  features: [],
  ...overrides,
});

// Mirrors the seeded catalogue, including the categories that used to be missing.
const CATALOGUE: Product[] = [
  product({ id: 'linen-blend-blazer', name: 'Linen Blend Blazer', price: 89.99, oldPrice: 129.99, category: 'Women', stock: 50, createdAt: '2026-01-12T09:00:00.000Z', description: 'Tailored and lightweight', features: ['Linen blend'] }),
  product({ id: 'ribbed-knit-top', name: 'Ribbed Knit Top', price: 25.99, oldPrice: 49, category: 'Tops', stock: 100, createdAt: '2026-02-03T09:00:00.000Z' }),
  product({ id: 'wide-leg-trousers', name: 'Wide Leg Trousers', price: 59.99, oldPrice: 85.99, category: 'Women', stock: 75, createdAt: '2026-03-18T09:00:00.000Z' }),
  product({ id: 'leather-shoulder-bag', name: 'Leather Shoulder Bag', price: 79.99, oldPrice: 110, category: 'Bags', stock: 0, createdAt: '2026-04-27T09:00:00.000Z' }),
  product({ id: 'minimalist-strappy-heels', name: 'Minimalist Strappy Heels', price: 49.99, category: 'Shoes', stock: 40, createdAt: '2026-05-09T09:00:00.000Z' }),
];

const ids = (filters: Partial<FilterState>) =>
  applyFilters(CATALOGUE, { ...base, ...filters }).map((p) => p.id);

describe('category filtering', () => {
  // Regression: this used to substring-match the category against the product
  // id/name, so *every* category returned zero products.
  it('matches on the real category field', () => {
    expect(ids({ categories: ['Women'] })).toEqual(['linen-blend-blazer', 'wide-leg-trousers']);
    expect(ids({ categories: ['Bags'] })).toEqual(['leather-shoulder-bag']);
    expect(ids({ categories: ['Shoes'] })).toEqual(['minimalist-strappy-heels']);
    expect(ids({ categories: ['Tops'] })).toEqual(['ribbed-knit-top']);
  });

  it('is case-insensitive', () => {
    expect(ids({ categories: ['women'] })).toEqual(ids({ categories: ['Women'] }));
  });

  it('ORs multiple categories together', () => {
    expect(ids({ categories: ['Bags', 'Shoes'] })).toEqual([
      'leather-shoulder-bag',
      'minimalist-strappy-heels',
    ]);
  });

  it('returns nothing for a category no product uses', () => {
    expect(ids({ categories: ['Accessories'] })).toEqual([]);
  });

  it('ignores products with no category when a filter is active', () => {
    const withUncategorised = [...CATALOGUE, product({ id: 'mystery', name: 'Mystery', category: undefined })];
    expect(applyFilters(withUncategorised, { ...base, categories: ['Women'] }).map((p) => p.id))
      .not.toContain('mystery');
  });
});

describe('search', () => {
  it('matches name, description, category and features', () => {
    expect(ids({ query: 'linen' })).toEqual(['linen-blend-blazer']);
    expect(ids({ query: 'tailored' })).toEqual(['linen-blend-blazer']);
    expect(ids({ query: 'shoes' })).toEqual(['minimalist-strappy-heels']);
  });

  it('returns everything for an empty query', () => {
    expect(ids({ query: '' })).toHaveLength(CATALOGUE.length);
  });

  it('returns nothing for a query with no matches', () => {
    expect(ids({ query: 'zzzzz' })).toEqual([]);
  });
});

describe('price range', () => {
  it('is inclusive on both ends', () => {
    // default sort is by name, so heels come before trousers
    expect(ids({ priceRange: [49.99, 59.99] })).toEqual([
      'minimalist-strappy-heels',
      'wide-leg-trousers',
    ]);
  });

  it('tolerates a reversed range', () => {
    expect(ids({ priceRange: [59.99, 49.99] })).toEqual(ids({ priceRange: [49.99, 59.99] }));
  });

  // Regression: a hardcoded [0, 1000] default used to hide anything pricier
  // from both the shop and the homepage featured grid.
  it('a null range keeps every price, however expensive', () => {
    const luxe: Product[] = [
      ...CATALOGUE,
      product({ id: 'prevails-pamper', name: "Prevail's Pamper", price: 28000, category: 'Baby', featured: true }),
    ];
    const all = applyFilters(luxe, base).map((p) => p.id);
    expect(all).toContain('prevails-pamper');

    // …and a shopper-narrowed range still excludes it.
    const narrowed = applyFilters(luxe, { ...base, priceRange: [0, 1000] }).map((p) => p.id);
    expect(narrowed).not.toContain('prevails-pamper');
  });

  it('featured filtering does not lose expensive products either', () => {
    const luxe: Product[] = [
      ...CATALOGUE,
      product({ id: 'diamond-coat', name: 'Diamond Coat', price: 99000, featured: true }),
    ];
    const featured = applyFilters(luxe, base).filter((p) => p.featured).map((p) => p.id);
    expect(featured).toContain('diamond-coat');
  });
});

describe('availability and sale flags', () => {
  it('hides out-of-stock products when inStock is on', () => {
    expect(ids({ inStock: true })).not.toContain('leather-shoulder-bag');
    expect(ids({ inStock: true })).toHaveLength(4);
  });

  it('treats a missing stock value as available', () => {
    const noStock = [product({ id: 'a', name: 'A' })];
    expect(applyFilters(noStock, { ...base, inStock: true })).toHaveLength(1);
  });

  it('only keeps discounted products when onSale is on', () => {
    expect(ids({ onSale: true })).not.toContain('minimalist-strappy-heels');
    expect(ids({ onSale: true })).toHaveLength(4);
  });
});

describe('sorting', () => {
  it('sorts by name ascending by default', () => {
    expect(ids({}).map((id) => id)).toEqual([
      'leather-shoulder-bag',
      'linen-blend-blazer',
      'minimalist-strappy-heels',
      'ribbed-knit-top',
      'wide-leg-trousers',
    ]);
  });

  it('sorts by price both ways', () => {
    expect(applyFilters(CATALOGUE, { ...base, sortBy: 'price-asc' }).map((p) => p.price))
      .toEqual([25.99, 49.99, 59.99, 79.99, 89.99]);
    expect(applyFilters(CATALOGUE, { ...base, sortBy: 'price-desc' }).map((p) => p.price))
      .toEqual([89.99, 79.99, 59.99, 49.99, 25.99]);
  });

  it('sorts newest first by createdAt', () => {
    expect(ids({ sortBy: 'newest' })).toEqual([
      'minimalist-strappy-heels',
      'leather-shoulder-bag',
      'wide-leg-trousers',
      'ribbed-knit-top',
      'linen-blend-blazer',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...CATALOGUE];
    applyFilters(input, { ...base, sortBy: 'price-desc' });
    expect(input).toEqual(CATALOGUE);
  });
});

describe('combining filters', () => {
  it('ANDs everything together', () => {
    expect(ids({ categories: ['Women'], priceRange: [0, 60], sortBy: 'price-asc' })).toEqual([
      'wide-leg-trousers',
    ]);
  });
});
