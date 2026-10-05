/**
 * Mirrors the backend `products` table / `GET /api/products` response.
 * Keep in sync with backend/middleware/validate.js → schemas.product.
 */
export interface Product {
  id: string;
  name: string;
  price: number;
  /** Sale "was" price; renders a strikethrough when present. */
  oldPrice?: number;
  image: string;
  description: string;
  features: string[];
  rating?: string;
  reviews?: string;
  category?: string;
  stock?: number;
  /** Extra images beyond `image`; rendered as thumbnails on the detail page. */
  gallery?: string[];
  /** Admin-controlled: hidden products never reach the storefront. */
  published?: boolean;
  /** Admin-controlled: drives the homepage featured grid. */
  featured?: boolean;
  /** ISO timestamp — drives the "Newest first" sort. */
  createdAt?: string;
}

export interface ProductVariant {
  id: number;
  product_id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  stock: number;
}

/** Raw shape returned by the API (snake_case) before mapping to `Product`. */
export interface ApiProduct {
  id: string;
  name: string;
  price: number;
  old_price: number | null;
  image: string | null;
  description: string | null;
  features: string[] | null;
  rating: string | null;
  reviews: string | null;
  category: string | null;
  stock: number | null;
  gallery?: string[] | null;
  published?: boolean | number | null;
  featured?: boolean | number | null;
  created_at?: string;
  variants?: ProductVariant[];
}

export function mapApiProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    oldPrice: p.old_price == null ? undefined : Number(p.old_price),
    image: p.image ?? '',
    description: p.description ?? '',
    features: Array.isArray(p.features) ? p.features : [],
    rating: p.rating ?? undefined,
    reviews: p.reviews ?? undefined,
    category: p.category ?? undefined,
    stock: p.stock == null ? undefined : Number(p.stock),
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    published: p.published == null ? true : Boolean(p.published),
    featured: Boolean(p.featured),
    createdAt: p.created_at,
  };
}
