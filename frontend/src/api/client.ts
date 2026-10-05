import { getAuthToken, getSessionId, setSessionId } from '@utils/storage.ts';
import type { ApiProduct, ProductVariant } from '@app-types/product.ts';
import type { CartResponse, Order } from '@app-types/cart.ts';
import type { SiteSettings } from '@features/content/siteSettings.ts';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    super(messageFrom(data));
    this.name = 'ApiError';
  }

  /** The server's human-readable message, if it sent one. */
  get serverMessage(): string | undefined {
    const data = this.data as { error?: string } | null;
    return data?.error;
  }
}

function messageFrom(data: unknown): string {
  const error = (data as { error?: string } | null)?.error;
  return error || 'API request failed';
}

/**
 * `crypto.randomUUID()` only exists in secure contexts (https or localhost).
 * Over plain http on a LAN IP it is undefined, which used to break every
 * request — so fall back to a good-enough random id.
 */
function createSessionId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ensureSessionId(): string {
  const existing = getSessionId();
  if (existing) return existing;

  const created = createSessionId();
  setSessionId(created);
  return created;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Send the request even when no session/auth identity exists. */
  anonymous?: boolean;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, headers: extraHeaders, ...init } = options;

  const token = getAuthToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (!anonymous) headers['X-Session-Id'] = ensureSessionId();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...init,
    headers,
    body: payload,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    console.error('API request failed:', { endpoint, status: res.status, data });
    throw new ApiError(res.status, data);
  }

  return data as T;
}

function toQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  });
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  /** How many guest cart lines were absorbed into the account. */
  cartMerged: number;
  /** True when an existing account was promoted rather than created. */
  promotedExisting?: boolean;
}

/** What the admin gate is allowed to offer right now. */
export interface AdminSetupStatus {
  /** Show the "create an admin account" form at all. */
  canCreateAdmin: boolean;
  /** That form must also collect the ADMIN_SETUP_KEY. */
  requiresSetupKey: boolean;
  /** No admin exists yet, so this registration creates the first one. */
  firstRun: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'customer';
  createdAt: string;
  orderCount: number;
}

export interface CardDetails {
  name: string;
  number: string;
  exp: string;
  cvc: string;
}

export interface StoreConfig {
  payment: { provider: string; live: boolean; notice: string | null };
  pricing: {
    currency: string;
    freeShippingThreshold: number;
    flatShipping: number;
    taxRate: number;
  };
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  image: string;
  sortOrder: number;
  published: boolean;
  productCount: number;
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string;
  image?: string | null;
  sortOrder?: number;
  published?: boolean;
}

export interface WishlistItem {
  productId: string;
  addedAt: string;
  name: string;
  price: number;
  image: string;
  stock: number;
}

export interface ProductListParams {
  category?: string;
  search?: string;
  sort?: 'name' | 'price-asc' | 'price-desc' | 'newest';
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}

export interface AdminStats {
  products: number;
  published: number;
  hidden: number;
  featured: number;
  variants: number;
  orders: number;
  customers: number;
  subscribers: number;
  revenue: number;
  awaitingPayment: number;
  lowStock: Array<{ id: string; name: string; stock: number }>;
}

export interface AdminProduct {
  id: string;
  name: string;
  price: number;
  old_price: number | null;
  image: string | null;
  description: string | null;
  features: string[];
  rating: string | null;
  reviews: string | null;
  category: string | null;
  stock: number;
  gallery: string[];
  published: boolean;
  featured: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AdminProductInput = Omit<AdminProduct, 'features' | 'gallery' | 'published' | 'featured'> & {
  features: string[];
  gallery: string[];
  published: boolean;
  featured: boolean;
};

export interface AdminVariantInput {
  size: string;
  color: string;
  sku?: string | null;
  stock: number;
}

export interface AdminOrder {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  city: string;
  country: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: string;
  item_count?: number;
  created_at: string;
}

export interface AdminSubscriber {
  id: number;
  email: string;
  created_at: string;
}

export const api = {
  auth: {
    register: (data: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => request<AuthResponse>('/auth/register', { method: 'POST', body: data }),

    login: (data: { email: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: data }),

    me: () => request<{ user: AuthUser }>('/auth/me'),

    updateProfile: (data: { firstName?: string; lastName?: string }) =>
      request<{ user: AuthUser }>('/auth/me', { method: 'PATCH', body: data }),

    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request<{ user: AuthUser; token: string }>('/auth/password', {
        method: 'POST',
        body: data,
      }),

    /** Whether the "create an admin" form should be offered. Public. */
    adminSetup: () => request<AdminSetupStatus>('/auth/admin-setup', { anonymous: true }),

    /**
     * Creates the first admin account, or another one when the server has an
     * ADMIN_SETUP_KEY configured. Returns 403 once admin sign-up is closed.
     */
    registerAdmin: (data: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      setupKey?: string;
    }) => request<AuthResponse>('/auth/register-admin', { method: 'POST', body: data }),
  },

  storeConfig: () => request<StoreConfig>('/store-config', { anonymous: true }),

  /** Public, read-only copy for the storefront (see features/content/siteSettings.ts). */
  settings: () =>
    request<{ settings: SiteSettings }>('/settings', { anonymous: true }),

  /** Published collections with live product counts — tiles, filters and nav. */
  categories: () => request<Category[]>('/categories', { anonymous: true }),

  wishlist: {
    list: () => request<{ items: WishlistItem[] }>('/wishlist'),
    add: (productId: string) =>
      request<{ items: WishlistItem[] }>('/wishlist', { method: 'POST', body: { productId } }),
    remove: (productId: string) =>
      request<{ items: WishlistItem[] }>(`/wishlist/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      }),
    replace: (productIds: string[]) =>
      request<{ items: WishlistItem[]; saved: number }>('/wishlist', {
        method: 'PUT',
        body: { productIds },
      }),
  },

  products: {
    list: (params?: ProductListParams) =>
      request<ApiProduct[]>(`/products${toQuery(params as Record<string, unknown>)}`),

    get: (id: string) =>
      request<ApiProduct & { variants: ProductVariant[] }>(
        `/products/${encodeURIComponent(id)}`
      ),

    variants: (id: string) =>
      request<ProductVariant[]>(`/products/${encodeURIComponent(id)}/variants`),

    categories: () =>
      request<Array<{ name: string; count: number }>>('/products/meta/categories'),
  },

  cart: {
    get: () => request<CartResponse>('/cart'),

    add: (data: { productId: string; variantId?: number; quantity: number }) =>
      request<CartResponse>('/cart', { method: 'POST', body: data }),

    update: (itemId: string | number, quantity: number) =>
      request<CartResponse>(`/cart/${encodeURIComponent(String(itemId))}`, {
        method: 'PATCH',
        body: { quantity },
      }),

    remove: (itemId: string | number) =>
      request<void>(`/cart/${encodeURIComponent(String(itemId))}`, { method: 'DELETE' }),

    clear: () => request<void>('/cart', { method: 'DELETE' }),
  },

  orders: {
    create: (data: {
      email: string;
      firstName: string;
      lastName: string;
      address: string;
      city: string;
      postalCode: string;
      country?: string;
      paymentMethodId?: string;
    }) => request<Order>('/orders', { method: 'POST', body: data }),

    list: () => request<Order[]>('/orders'),

    get: (id: string) => request<Order>(`/orders/${encodeURIComponent(id)}`),

    /** Charges a pending order. 402 means the gateway declined it. */
    pay: (id: string, card: CardDetails) =>
      request<Order>(`/orders/${encodeURIComponent(id)}/pay`, {
        method: 'POST',
        body: { card },
      }),

    cancel: (id: string) =>
      request<Order>(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  },

  subscribers: {
    subscribe: (email: string) =>
      request<{ success: boolean; alreadySubscribed?: boolean }>('/subscribers', {
        method: 'POST',
        body: { email },
      }),
  },

  admin: {
    stats: () => request<AdminStats>('/admin/stats'),

    orders: () => request<AdminOrder[]>('/admin/orders'),
    order: (id: string) => request<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`),
    setOrderStatus: (id: string, status: string) =>
      request<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status },
      }),

    products: () => request<AdminProduct[]>('/admin/products'),
    product: (id: string) => request<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`),
    /** Upsert: send only the keys you want to change. */
    saveProduct: (product: Partial<AdminProductInput> & { id: string }) =>
      request<AdminProduct>('/admin/products', { method: 'POST', body: product }),
    deleteProduct: (id: string) =>
      request<void>(`/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    replaceVariants: (id: string, variants: AdminVariantInput[]) =>
      request<{ variants: ProductVariant[]; inserted: number; updated: number; removed: number }>(
        `/admin/products/${encodeURIComponent(id)}/variants`,
        { method: 'PUT', body: { variants } }
      ),

    settings: () => request<{ settings: SiteSettings; keys: string[] }>('/admin/settings'),
    saveSettings: (patch: Partial<SiteSettings>) =>
      request<{ settings: SiteSettings; applied: string[]; rejected: string[] }>(
        '/admin/settings',
        { method: 'PUT', body: patch }
      ),
    resetSettings: (keys?: string[]) =>
      request<{ settings: SiteSettings; reset: string[] }>('/admin/settings/reset', {
        method: 'POST',
        body: { keys },
      }),

    /** Raw image bytes in, `{ url }` out. */
    uploadImage: async (file: File): Promise<{ url: string; bytes: number }> => {
      const res = await fetch(`${API_BASE}/admin/uploads`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          Authorization: `Bearer ${getAuthToken() ?? ''}`,
          'X-Session-Id': ensureSessionId(),
        },
        body: file,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data);
      return data as { url: string; bytes: number };
    },

    subscribers: () => request<AdminSubscriber[]>('/admin/subscribers'),

    categories: () => request<Category[]>('/admin/categories'),
    createCategory: (input: CategoryInput) =>
      request<Category>('/admin/categories', { method: 'POST', body: input }),
    updateCategory: (id: number, patch: Partial<CategoryInput>) =>
      request<Category>(`/admin/categories/${id}`, { method: 'PATCH', body: patch }),
    deleteCategory: (id: number) =>
      request<void>(`/admin/categories/${id}`, { method: 'DELETE' }),

    users: () => request<AdminUser[]>('/admin/users'),
    setUserRole: (id: number, role: 'admin' | 'customer') =>
      request<{ id: number; email: string; role: string; message: string }>(
        `/admin/users/${id}/role`,
        { method: 'PATCH', body: { role } }
      ),
  },
};

export { request };
