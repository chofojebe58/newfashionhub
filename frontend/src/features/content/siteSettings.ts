import { api } from '@api/client.ts';
import { safeUrl } from '@utils/escape.ts';

/**
 * Applies admin-editable copy to the public pages.
 *
 * Any element can opt in with data attributes:
 *
 *   data-setting="heroTitle"              → sets textContent
 *   data-setting-href="heroCtaHref"       → sets href (URL-sanitised)
 *   data-setting-src="heroImage"          → sets src  (URL-sanitised)
 *   data-setting-alt="heroImageAlt"       → sets alt
 *   data-setting-hide-when-empty="true"   → hides the element when the value is blank
 *
 * Text goes through `textContent` and URLs through `safeUrl`, so a compromised
 * admin account cannot inject markup or a `javascript:` link into the storefront.
 */
export interface SiteSettings {
  [key: string]: string;
}

let cached: SiteSettings | null = null;

export function getSiteSettings(): SiteSettings | null {
  return cached;
}

export async function loadSiteSettings(): Promise<SiteSettings | null> {
  if (cached) return cached;
  try {
    const { settings } = await api.settings();
    cached = settings;
    return settings;
  } catch (error) {
    // The hardcoded HTML stays in place, so the page is never blank.
    console.warn('Could not load site settings:', error);
    return null;
  }
}

export async function applySiteSettings(): Promise<void> {
  const nodes = document.querySelectorAll<HTMLElement>(
    '[data-setting], [data-setting-href], [data-setting-src], [data-setting-alt]'
  );
  if (!nodes.length) return;

  const settings = await loadSiteSettings();
  if (!settings) return;

  nodes.forEach((node) => applyToNode(node, settings));
}

function applyToNode(node: HTMLElement, settings: SiteSettings): void {
  let touched = false;

  const textKey = node.dataset.setting;
  if (textKey && textKey in settings) {
    node.textContent = settings[textKey];
    touched = true;
  }

  const hrefKey = node.dataset.settingHref;
  if (hrefKey && hrefKey in settings) {
    node.setAttribute('href', safeUrl(settings[hrefKey], '#'));
    touched = true;
  }

  const srcKey = node.dataset.settingSrc;
  if (srcKey && srcKey in settings) {
    const url = safeUrl(settings[srcKey], '');
    if (url) node.setAttribute('src', url);
    touched = true;
  }

  const altKey = node.dataset.settingAlt;
  if (altKey && altKey in settings) {
    node.setAttribute('alt', settings[altKey]);
    touched = true;
  }

  if (node.dataset.settingHideWhenEmpty === 'true' && textKey) {
    const blank = !(settings[textKey] ?? '').trim();
    node.hidden = blank;
    if (blank) touched = false;
  }

  if (touched) node.classList.add('settings-applied');
}
