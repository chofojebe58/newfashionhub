/**
 * Everything the UI renders is interpolated into `innerHTML`, so every
 * untrusted string must pass through here first. Product names come from the
 * admin API and cart names come from the database — both are attacker-writable
 * if the admin surface is ever exposed.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

/** Alias for readability inside attribute values. */
export const escapeAttr = escapeHtml;

const SAFE_URL = /^(?:https?:|mailto:|\/|#|\.\/|\.\.\/)/i;

/**
 * Blocks `javascript:` / `data:` URLs in `href` and `src`.
 * Falls back to '#' so a bad value never produces a broken attribute.
 */
export function safeUrl(value: unknown, fallback = '#'): string {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  return SAFE_URL.test(url) ? escapeAttr(url) : fallback;
}

export function formatList(parts: Array<string | null | undefined>, separator = ' / '): string {
  return parts.filter(Boolean).join(separator);
}
