import { loadCategories } from './categories.ts';
import { categoryHref } from './categories.ts';
import { escapeAttr, escapeHtml } from '@utils/escape.ts';

/**
 * Builds the header navigation from the live category list.
 *
 * Every page has a `<nav class="main-nav" data-nav-slot>`; the old hardcoded
 * links (four of them pointing at two anchors) are replaced with real
 * collection pages as soon as the categories arrive. Until then — or if the
 * API is down — the static links stay in place.
 */
const MAX_LINKS = 5;

export async function initNavigation(): Promise<void> {
  const navs = document.querySelectorAll<HTMLElement>('[data-nav-slot]');
  if (!navs.length) return;

  const categories = await loadCategories();
  if (!categories.length) return;

  const links = categories
    .filter((c) => c.published)
    .slice(0, MAX_LINKS)
    .map(
      (c) =>
        `<a href="${escapeAttr(categoryHref(c.slug))}">${escapeHtml(c.name)}${
          c.productCount ? '' : ''
        }</a>`
    )
    .join('');

  navs.forEach((nav) => {
    nav.innerHTML = `${links}<a href="lookbook.html">Journal</a>`;
  });
}
