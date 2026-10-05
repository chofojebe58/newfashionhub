import { api, type Category } from '@api/client.ts';
import { escapeAttr, escapeHtml, safeUrl } from '@utils/escape.ts';

/**
 * Client-side category store.
 *
 * The storefront used to hardcode its collection tiles ("Women, Men, Dresses…")
 * in the HTML, so they never matched the real inventory and were not links.
 * Everything now renders from `GET /api/categories`, which the admin controls.
 */
let cache: Category[] | null = null;
let loading: Promise<Category[]> | null = null;

export function getCategories(): Category[] {
  return cache ?? [];
}

export function loadCategories(force = false): Promise<Category[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (loading && !force) return loading;

  loading = api
    .categories()
    .then((categories) => {
      cache = categories;
      return categories;
    })
    .catch((error) => {
      console.warn('Could not load categories:', error);
      return cache ?? [];
    });

  return loading;
}

export function categoryBySlug(slug: string): Category | undefined {
  return (cache ?? []).find((c) => c.slug === slug);
}

/** The URL for a collection page: `shop.html?category=men`. */
export function categoryHref(slugOrName: string): string {
  const match = categoryBySlug(slugOrName) ?? categoryBySlug(slugify(slugOrName));
  const slug = match?.slug ?? slugify(slugOrName);
  return `shop.html?category=${encodeURIComponent(slug)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fallback tiles for the first paint and for no-JS: the static HTML already
 * contains a sensible set, so the page is never empty while this loads.
 */
export const FALLBACK_CATEGORIES: Array<{ slug: string; name: string }> = [
  { slug: 'women', name: 'Women' },
  { slug: 'men', name: 'Men' },
  { slug: 'dresses', name: 'Dresses' },
  { slug: 'tops', name: 'Tops' },
  { slug: 'shoes', name: 'Shoes' },
  { slug: 'bags', name: 'Bags' },
  { slug: 'accessories', name: 'Accessories' },
];


/* ------------------------------------------------------------------ tiles */

/**
 * Renders the collection tiles (the "Women / Men / Dresses" row) as real links
 * to real collection pages. Runs from the live category list; the static HTML
 * underneath is only a first-paint / no-JS fallback and is replaced here.
 */
export function renderCategoryTiles(containerSelector = '.category-row'): number {
  const container = document.querySelector<HTMLElement>(containerSelector);
  if (!container) return 0;

  const categories = (cache ?? []).filter((c) => c.published);
  if (!categories.length) return 0; // keep the static fallback

  container.innerHTML = categories
    .map((c) => {
      const count = c.productCount;
      const badge =
        count === 0
          ? '<span class="category-flag">New</span>'
          : `<span class="category-count">${escapeHtml(count)}</span>`;

      return `
        <a class="category-item" href="${escapeAttr(categoryHref(c.slug))}"
           aria-label="Shop the ${escapeAttr(c.name)} collection">
          <div class="category-visual">
            ${
              c.image
                ? `<img src="${safeUrl(c.image, '')}" alt="" loading="lazy" decoding="async" />`
                : '<span class="category-initial" aria-hidden="true">' +
                  escapeHtml(c.name.charAt(0).toUpperCase()) +
                  '</span>'
            }
            ${badge}
          </div>
          <div class="category-label">
            <span class="category-name">${escapeHtml(c.name)}</span>
            ${c.description ? `<span class="category-desc">${escapeHtml(c.description)}</span>` : ''}
          </div>
        </a>
      `;
    })
    .join('');

  return categories.length;
}
