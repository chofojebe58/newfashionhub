import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '@api/client.ts';

const CATEGORIES: Category[] = [
  { id: 1, slug: 'women', name: 'Women', description: 'Tailored staples.', image: '/w.jpg', sortOrder: 0, published: true, productCount: 3 },
  { id: 2, slug: 'men', name: 'Men', description: 'Sharp and relaxed.', image: '/m.jpg', sortOrder: 10, published: true, productCount: 3 },
  { id: 3, slug: 'resort-wear', name: 'Resort Wear', description: '', image: '', sortOrder: 20, published: true, productCount: 0 },
  { id: 4, slug: 'archive', name: 'Archive', description: '', image: '', sortOrder: 30, published: false, productCount: 2 },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div class="category-row"><div class="category-item">static fallback</div></div>';
});

describe('loadCategories', () => {
  it('fetches and caches the published list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATEGORIES));
    vi.stubGlobal('fetch', fetchMock);

    const { loadCategories: load } = await import('./categories.ts');
    const first = await load();
    const second = await load();

    expect(first).toHaveLength(4);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second call must hit the cache
  });

  it('survives an unreachable API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { loadCategories: load } = await import('./categories.ts');
    await expect(load()).resolves.toEqual([]);
  });
});

describe('categoryHref', () => {
  it('builds a collection-page URL from a slug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATEGORIES)));
    const mod = await import('./categories.ts');
    await mod.loadCategories();

    expect(mod.categoryHref('men')).toBe('shop.html?category=men');
    expect(mod.categoryHref('resort-wear')).toBe('shop.html?category=resort-wear');
  });

  it('falls back to slugifying an unknown name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATEGORIES)));
    const mod = await import('./categories.ts');
    await mod.loadCategories();

    expect(mod.categoryHref('Swim & Sun')).toBe('shop.html?category=swim-sun');
  });
});

describe('renderCategoryTiles', () => {
  it('replaces the static fallback with real links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATEGORIES)));
    const mod = await import('./categories.ts');
    await mod.loadCategories();
    const count = mod.renderCategoryTiles();

    const row = document.querySelector('.category-row')!;
    expect(count).toBe(3); // hidden categories are not rendered
    expect(row.querySelectorAll('a.category-item').length).toBe(3);

    const men = row.querySelector<HTMLAnchorElement>('a[href="shop.html?category=men"]');
    expect(men).not.toBeNull();
    expect(men!.textContent).toContain('Men');
    expect(men!.getAttribute('aria-label')).toBe('Shop the Men collection');
  });

  it('marks an empty collection as New instead of showing a zero count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATEGORIES)));
    const mod = await import('./categories.ts');
    await mod.loadCategories();
    mod.renderCategoryTiles();

    const row = document.querySelector('.category-row')!;
    const resort = row.querySelector('a[href="shop.html?category=resort-wear"]')!;
    expect(resort.innerHTML).toContain('category-flag');
    expect(resort.textContent).toContain('New');
    expect(resort.textContent).not.toContain('>0<');
  });

  it('escapes a hostile category name', async () => {
    const hostile: Category[] = [
      { ...CATEGORIES[0], name: '<img src=x onerror=alert(1)>' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(hostile)));
    const mod = await import('./categories.ts');
    await mod.loadCategories(true);
    mod.renderCategoryTiles();

    const row = document.querySelector('.category-row')!;

    // The payload must never become an element or an event handler.
    expect(row.querySelector('img[onerror]')).toBeNull();
    expect(row.querySelectorAll('img')).toHaveLength(1); // only the tile image
    expect(row.querySelector('script')).toBeNull();

    // As text it renders literally; as an attribute it is inert.
    const anchor = row.querySelector<HTMLAnchorElement>('a.category-item')!;
    expect(anchor.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(anchor.getAttribute('aria-label')).toBe(
      'Shop the <img src=x onerror=alert(1)> collection'
    );
  });

  it('keeps the static fallback when the API returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));
    const mod = await import('./categories.ts');
    await mod.loadCategories(true);
    expect(mod.renderCategoryTiles()).toBe(0);
    expect(document.querySelector('.category-row')!.innerHTML).toContain('static fallback');
  });

  it('shows a letter placeholder when a category has no image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATEGORIES)));
    const mod = await import('./categories.ts');
    await mod.loadCategories();
    mod.renderCategoryTiles();

    const resort = document.querySelector('a[href="shop.html?category=resort-wear"]')!;
    expect(resort.querySelector('.category-initial')?.textContent).toBe('R');
  });
});
