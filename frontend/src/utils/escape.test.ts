import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml, formatList, safeUrl } from './escape.ts';

describe('escapeHtml', () => {
  it('neutralises markup that would otherwise execute', () => {
    const payload = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(payload)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(document.createRange().createContextualFragment(escapeHtml(payload)).textContent).toBe(payload);
  });

  it('escapes every attribute-breaking character', () => {
    expect(escapeHtml(`" ' \` < > &`)).toBe('&quot; &#39; &#96; &lt; &gt; &amp;');
  });

  it('renders null and undefined as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifies numbers safely', () => {
    expect(escapeHtml(89.99)).toBe('89.99');
  });

  it('escapeAttr is the same function', () => {
    expect(escapeAttr).toBe(escapeHtml);
  });
});

describe('safeUrl', () => {
  it('allows http(s), relative and anchor URLs', () => {
    expect(safeUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(safeUrl('/images/a.jpg')).toBe('/images/a.jpg');
    expect(safeUrl('#top')).toBe('#top');
  });

  it('blocks javascript: and data: URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('#');
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('#');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('falls back for empty values', () => {
    expect(safeUrl('')).toBe('#');
    expect(safeUrl(null, '')).toBe('');
    expect(safeUrl(undefined, 'placeholder.jpg')).toBe('placeholder.jpg');
  });
});

describe('formatList', () => {
  it('joins the parts that exist', () => {
    expect(formatList(['M', 'Black'])).toBe('M / Black');
    expect(formatList([null, 'Black'])).toBe('Black');
    expect(formatList(['M', 'Black'], ' · ')).toBe('M · Black');
    expect(formatList([])).toBe('');
  });
});
