import { api } from '@api/client.ts';
import { loadProducts, saveProducts } from '@utils/storage.ts';
import { mapApiProduct, type ApiProduct, type Product } from '@app-types/product.ts';

/**
 * Offline safety net. The shop renders from `GET /api/products`; these five are
 * only used when the API is unreachable AND there is no cached copy yet.
 * Keep in sync with backend/db/seed.js.
 */
const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'linen-blend-blazer',
    name: 'Linen Blend Blazer',
    price: 89.99,
    oldPrice: 129.99,
    image:
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    description:
      'A tailored, lightweight essential designed to bring structure and softness to your everyday wardrobe.',
    features: ['Premium linen blend texture', 'Relaxed tailored fit', 'Made for layering all season'],
    rating: '★★★★★',
    reviews: '(124 reviews)',
    category: 'Women',
    stock: 50,
    createdAt: '2026-01-12T09:00:00.000Z',
  },
  {
    id: 'ribbed-knit-top',
    name: 'Ribbed Knit Top',
    price: 25.99,
    oldPrice: 49.0,
    image:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
    description:
      'Soft-touch knitwear with a flattering silhouette that layers beautifully from work to weekend.',
    features: ['Breathable cotton blend', 'Stretch comfort fit', 'Elevated everyday staple'],
    rating: '★★★★★',
    reviews: '(98 reviews)',
    category: 'Tops',
    stock: 100,
    createdAt: '2026-02-03T09:00:00.000Z',
  },
  {
    id: 'wide-leg-trousers',
    name: 'Wide Leg Trousers',
    price: 59.99,
    oldPrice: 85.99,
    image:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    description:
      'Crafted to create a fluid silhouette with a polished finish that moves effortlessly through the day.',
    features: ['Soft drape fabric', 'Comfortable high-rise waist', 'Day-to-evening versatility'],
    rating: '★★★★★',
    reviews: '(181 reviews)',
    category: 'Women',
    stock: 75,
    createdAt: '2026-03-18T09:00:00.000Z',
  },
  {
    id: 'leather-shoulder-bag',
    name: 'Leather Shoulder Bag',
    price: 79.99,
    oldPrice: 110.0,
    image:
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80',
    description:
      'A refined everyday companion with structured lines, room for essentials, and timeless appeal.',
    features: ['Full-grain leather finish', 'Spacious interior', 'Adjustable strap comfort'],
    rating: '★★★★★',
    reviews: '(112 reviews)',
    category: 'Bags',
    stock: 30,
    createdAt: '2026-04-27T09:00:00.000Z',
  },
  {
    id: 'minimalist-strappy-heels',
    name: 'Minimalist Strappy Heels',
    price: 49.99,
    oldPrice: 79.0,
    image:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80',
    description:
      'A sleek statement heel with a refined profile that elevates evening wear and special occasions alike.',
    features: ['Comfort cushioned insole', 'Lightweight design', 'Elegant evening-ready finish'],
    rating: '★★★★★',
    reviews: '(164 reviews)',
    category: 'Shoes',
    stock: 40,
    createdAt: '2026-05-09T09:00:00.000Z',
  },
];

export type CatalogSource = 'api' | 'cache' | 'defaults';

let productCatalog: Record<string, Product> | null = null;
let catalogSource: CatalogSource = 'defaults';
let loadPromise: Promise<CatalogSource> | null = null;

function toRecord(products: Product[]): Record<string, Product> {
  return products.reduce<Record<string, Product>>((acc, p) => {
    if (p?.id) acc[p.id] = p;
    return acc;
  }, {});
}

function defaultsRecord(): Record<string, Product> {
  return toRecord(DEFAULT_PRODUCTS);
}

export function getProductCatalog(): Record<string, Product> {
  if (!productCatalog) {
    productCatalog = defaultsRecord();
  }
  return productCatalog;
}

export function getCatalogSource(): CatalogSource {
  return catalogSource;
}

export function getAllProducts(): Product[] {
  return Object.values(getProductCatalog());
}

export function getProduct(id: string): Product | undefined {
  return getProductCatalog()[id];
}

/**
 * Loads the catalogue from the API, falling back to the last cached copy and
 * finally to the built-in defaults. Idempotent — safe to call from every page.
 */
export function loadCatalog(): Promise<CatalogSource> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const products = (await api.products.list({ limit: 100 })) as ApiProduct[];
      if (!Array.isArray(products) || products.length === 0) throw new Error('Empty catalogue');

      productCatalog = toRecord(products.map(mapApiProduct));
      catalogSource = 'api';
      saveProducts(products.map(mapApiProduct));
    } catch (err) {
      console.warn('Product API unavailable, using cached catalogue:', err);
      const cached = loadProducts();
      if (cached && Object.keys(cached).length > 0) {
        productCatalog = cached;
        catalogSource = 'cache';
      } else {
        productCatalog = defaultsRecord();
        catalogSource = 'defaults';
      }
    }
    return catalogSource;
  })();

  return loadPromise;
}

/** Test/admin hook: replace the in-memory catalogue. */
export function setProductCatalog(products: Product[] | Record<string, Product>): void {
  productCatalog = Array.isArray(products) ? toRecord(products) : products;
  catalogSource = 'cache';
  saveProducts(Object.values(productCatalog));
}

export { DEFAULT_PRODUCTS };
