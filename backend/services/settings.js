import { db } from '../db.js';

/**
 * Editable public-site copy.
 *
 * This object is the single source of truth for which keys exist: the migration
 * seeds it, `GET /api/settings` returns it, and `PUT /api/admin/settings` only
 * accepts these keys. Adding a new editable field means adding one line here
 * plus a `data-setting="key"` attribute in the HTML.
 */
export const DEFAULT_SETTINGS = {
  announcement: '',

  heroEyebrow: 'New Collection',
  heroTitle: 'Elevate Your Everyday Style',
  heroSubtitle:
    'Discover timeless pieces crafted for comfort, designed for elegance, made for you.',
  heroCtaPrimaryLabel: 'Shop Now →',
  heroCtaPrimaryHref: 'shop.html',
  heroCtaSecondaryLabel: '▶ Watch Lookbook',
  heroCtaSecondaryHref: 'lookbook.html',
  heroImage:
    'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
  heroImageAlt: 'Fashion model in neutral blazer',

  feature1Title: 'Free Shipping',
  feature1Text: 'On orders over $99',
  feature2Title: 'Easy Returns',
  feature2Text: '30-day returns',
  feature3Title: 'Secure Payment',
  feature3Text: '100% protected',

  featuredSectionTitle: 'Our Most Loved Picks',
  featuredSectionLinkLabel: 'View All Products',
  featuredSectionLinkHref: 'shop.html#featured',

  newsletterKicker: 'Get 10% off your first order',
  newsletterTitle: 'Join Our Style List',
  newsletterText: 'Sign up for exclusive offers, new arrivals, and style inspiration.',

  footerBlurb:
    'Timeless fashion for every mood, crafted with care and designed for everyday elegance.',
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

/** Keys that hold a URL rather than display text. */
export const URL_SETTINGS = new Set([
  'heroCtaPrimaryHref',
  'heroCtaSecondaryHref',
  'heroImage',
  'featuredSectionLinkHref',
]);

export function getSettings() {
  const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  // Defaults fill any key that has never been written, so the public API always
  // returns a complete object.
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function getSetting(key) {
  return getSettings()[key] ?? '';
}

/**
 * Writes only recognised keys; unknown ones are reported back rather than
 * silently dropped so a stale admin UI fails loudly.
 */
export const updateSettings = db.transaction((patch) => {
  const stmt = db.prepare(
    `INSERT INTO site_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at    = CURRENT_TIMESTAMP`
  );

  const applied = [];
  const rejected = [];

  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!SETTING_KEYS.includes(key)) {
      rejected.push(key);
      continue;
    }
    stmt.run(key, value == null ? '' : String(value));
    applied.push(key);
  }

  return { applied, rejected };
});
