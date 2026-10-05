import { describe, expect, it } from 'vitest';
import {
  emptyProductForm,
  prettyStatus,
  productToForm,
  renderDashboard,
  renderGate,
  renderOrdersTable,
  renderProductForm,
  renderProductTable,
  renderSettingsForm,
  renderShell,
  renderSubscribers,
  renderTeam,
  renderVariantMatrix,
  slugify,
} from './views.ts';
import type { AdminOrder, AdminProduct, AdminStats, AdminUser } from '@api/client.ts';

const product = (overrides: Partial<AdminProduct> = {}): AdminProduct => ({
  id: 'linen-blend-blazer',
  name: 'Linen Blend Blazer',
  price: 89.99,
  old_price: 129.99,
  image: 'https://example.com/a.jpg',
  description: 'A blazer.',
  features: ['Linen blend'],
  rating: '★★★★★',
  reviews: '(124 reviews)',
  category: 'Women',
  stock: 50,
  gallery: [],
  published: true,
  featured: false,
  ...overrides,
});

const stats: AdminStats = {
  products: 6, published: 5, hidden: 1, featured: 3, variants: 40,
  orders: 12, customers: 4, subscribers: 30, revenue: 1234.56,
  awaitingPayment: 2,
  lowStock: [{ id: 'a', name: 'Last One Left', stock: 0 }],
};

const order: AdminOrder = {
  id: 'ORD-ABC123', email: 'buyer@example.com', first_name: 'Jane', last_name: 'Smith',
  city: 'London', country: 'GB', subtotal: 100, shipping: 0, tax: 8, total: 108,
  status: 'paid', item_count: 2, created_at: '2026-05-01 10:00:00',
};

describe('escaping — the admin panel renders user-supplied text', () => {
  it('neutralises a script tag in a product name', () => {
    const html = renderProductTable([product({ name: '<script>alert(1)</script>' })], '');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises a payload in the description field of the editor', () => {
    const form = productToForm(product({ description: '"><img src=x onerror=alert(1)>' }), [], []);
    const html = renderProductForm(form, false);
    expect(html).not.toContain('onerror=alert(1)">');
    expect(html).toContain('&quot;');
  });

  it('blocks a javascript: image URL', () => {
    const html = renderProductTable([product({ image: 'javascript:alert(1)' })], '');
    expect(html).not.toContain('src="javascript:');
  });

  it('escapes admin-controlled homepage copy', () => {
    const html = renderSettingsForm({ heroTitle: '<b>bold</b>' } as never);
    expect(html).toContain('value="&lt;b&gt;bold&lt;/b&gt;"');
    expect(html).not.toContain('value="<b>bold</b>"');
  });

  it('escapes order and subscriber data', () => {
    const orders = renderOrdersTable([{ ...order, first_name: '<img src=x onerror=alert(1)>' }]);
    expect(orders).not.toContain('<img src=x onerror');

    const subs = renderSubscribers([{ id: 1, email: '<script>x</script>', created_at: '2026-01-01' }]);
    expect(subs).not.toContain('<script>x</script>');
  });

  it('escapes variant labels in the stock grid', () => {
    const html = renderVariantMatrix(['<b>S</b>'], ['"><x>'], {});
    expect(html).not.toContain('<b>S</b>');
    expect(html).toContain('&lt;b&gt;S&lt;/b&gt;');
  });
});

describe('renderProductTable', () => {
  it('reflects the published and featured state in the switches', () => {
    const live = renderProductTable([product({ published: true, featured: true })], '');
    expect(live).toContain('data-toggle="published"');
    expect(live.match(/checked/g)?.length).toBe(2);

    const draft = renderProductTable([product({ published: false, featured: false })], '');
    expect(draft).not.toContain('checked');
  });

  it('filters by name, id and category', () => {
    const products = [product(), product({ id: 'bag', name: 'Tote Bag', category: 'Bags' })];
    expect(renderProductTable(products, 'tote')).toContain('Tote Bag');
    expect(renderProductTable(products, 'tote')).not.toContain('Linen Blend Blazer');
    expect(renderProductTable(products, 'bags')).toContain('Tote Bag');
    expect(renderProductTable(products, 'zzz')).toContain('No products match that filter');
  });

  it('shows the sale price struck through', () => {
    expect(renderProductTable([product()], '')).toContain('admin-was');
  });
});

describe('renderProductForm', () => {
  it('locks the slug when editing and allows it when creating', () => {
    expect(renderProductForm(productToForm(product(), [], []), false)).toContain('readonly');
    expect(renderProductForm(emptyProductForm(), true)).not.toContain('readonly');
  });

  it('pre-checks published and leaves featured off for a new product', () => {
    const html = renderProductForm(emptyProductForm(), true);
    expect(html).toMatch(/name="published" checked/);
    expect(html).not.toMatch(/name="featured" checked/);
  });

  it('renders the existing gallery with a remove button per image', () => {
    const html = renderProductForm(
      productToForm(product({ gallery: ['/uploads/a.jpg', '/uploads/b.jpg'] }), [], []),
      false
    );
    // The form state carries the gallery; the list is rendered from it.
    expect(html).toContain('gallery-list');
    expect(html).toContain('data-gallery-add');
  });
});

describe('renderVariantMatrix', () => {
  it('builds a row per size and a column per colour', () => {
    const html = renderVariantMatrix(['S', 'M'], ['Black', 'White'], {});
    expect(html.match(/variant-stock/g)?.length).toBe(4);
    expect(html).toContain('data-size="S"');
    expect(html).toContain('data-color="White"');
  });

  it('prefills known stock and defaults the rest to zero', () => {
    const html = renderVariantMatrix(['S', 'M'], ['Black'], { 'S|Black': 7 });
    expect(html).toContain('value="7"');
    expect(html).toContain('value="0"');
  });

  it('renders nothing without both axes', () => {
    expect(renderVariantMatrix([], ['Black'], {})).toBe('');
    expect(renderVariantMatrix(['S'], [], {})).toBe('');
  });
});

describe('renderSettingsForm', () => {
  it('groups every editable key into a form field', () => {
    const settings = { heroTitle: 'x', announcement: '', footerBlurb: 'y' } as never;
    const html = renderSettingsForm(settings);
    expect(html).toContain('name="heroTitle"');
    expect(html).toContain('name="announcement"');
    expect(html).toContain('name="footerBlurb"');
    expect(html).toContain('Homepage content');
  });

  it('flags the fields that were just saved', () => {
    const html = renderSettingsForm({ heroTitle: 'x' } as never, ['heroTitle']);
    expect(html).toContain('just-saved');
    expect(html).toContain('saved-flag');
  });

  it('offers a per-section reset', () => {
    expect(renderSettingsForm({ heroTitle: 'x' } as never)).toContain('data-reset-group');
  });
});

describe('renderDashboard', () => {
  it('shows the publishing split and low stock', () => {
    const html = renderDashboard(stats);
    expect(html).toContain('Live on the site');
    expect(html).toContain('Last One Left');
    expect(html).toContain('0 left');
    expect(html).toContain('$1,234.56');
  });

  it('has an empty state when nothing is low', () => {
    expect(renderDashboard({ ...stats, lowStock: [] })).toContain('Nothing is running low');
  });
});

const OPEN_STATUS = { canCreateAdmin: true, requiresSetupKey: false, firstRun: true };
const KEYED_STATUS = { canCreateAdmin: true, requiresSetupKey: true, firstRun: false };
const CLOSED_STATUS = { canCreateAdmin: false, requiresSetupKey: false, firstRun: false };

describe('renderGate / renderShell', () => {
  it('shows a sign-in form plus the create-admin option on first run', () => {
    const html = renderGate(OPEN_STATUS, 'signin', 'Not an admin');
    expect(html).toContain('data-gate-form');
    expect(html).toContain('Not an admin');
    expect(html).toContain('data-gate-create');
    expect(html).toContain('Create the first admin account');
  });

  it('switches to the create-admin form and explains the first run', () => {
    const html = renderGate(OPEN_STATUS, 'create');
    expect(html).toContain('data-create-admin-form');
    expect(html).toContain('no administrator yet');
    expect(html).not.toContain('name="setupKey"');
  });

  it('asks for the setup key when the server has one configured', () => {
    const html = renderGate(KEYED_STATUS, 'create');
    expect(html).toContain('name="setupKey"');
    expect(html).toContain('ADMIN_SETUP_KEY');
  });

  it('explains how to get access when admin sign-up is closed', () => {
    const html = renderGate(CLOSED_STATUS, 'signin');
    expect(html).toContain('admin-gate-locked');
    expect(html).not.toContain('data-gate-create');
    expect(html).toContain('Team &amp; access');
  });

  it('escapes the gate error message', () => {
    const html = renderGate(OPEN_STATUS, 'signin', '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img');
  });

  it('marks the active tab', () => {
    const html = renderShell('products', 'Ada');
    expect(html).toContain('data-tab="products"');
    expect(html).toMatch(/admin-tab active"[^>]*data-tab="products"/s);
    expect(html).toContain('Ada');
  });
});

describe('renderOrdersTable', () => {
  it('preselects the current status', () => {
    const html = renderOrdersTable([order]);
    expect(html).toContain('<option value="paid" selected>');
    expect(html).toContain('ORD-ABC123');
    expect(html).toContain('$108.00');
  });

  it('has an empty state', () => {
    expect(renderOrdersTable([])).toContain('No orders yet');
  });
});

describe('renderTeam', () => {
  const users: AdminUser[] = [
    { id: 1, email: 'ada@example.com', firstName: 'Ada', lastName: 'L', role: 'admin', createdAt: '2026-01-01', orderCount: 3 },
    { id: 2, email: 'bob@example.com', firstName: 'Bob', lastName: '', role: 'customer', createdAt: '2026-02-01', orderCount: 0 },
  ];

  it('shows the role of every account', () => {
    const html = renderTeam(users, 1);
    expect(html).toContain('ada@example.com');
    expect(html).toContain('role-admin');
    expect(html).toContain('Customer');
  });

  it('never offers to change your own role', () => {
    const html = renderTeam(users, 1);
    expect(html).not.toContain('data-set-role="1"');
    expect(html).toContain('data-set-role="2"');
    expect(html).toContain('Make admin');
  });

  it('offers to remove admin from someone else', () => {
    expect(renderTeam(users, 2)).toContain('Remove admin');
  });

  it('escapes account names', () => {
    const html = renderTeam([{ ...users[0], firstName: '<script>x</script>' }], 9);
    expect(html).not.toContain('<script>x</script>');
  });

  it('has an empty state', () => {
    expect(renderTeam([], 1)).toContain('No accounts yet');
  });
});

describe('helpers', () => {
  it('slugify produces a URL-safe id', () => {
    expect(slugify('Linen Blend Blazer')).toBe('linen-blend-blazer');
    expect(slugify('  Cashmere & Silk Scarf! ')).toBe('cashmere-silk-scarf');
    expect(slugify('Ünïcödé Coat')).toBe('n-c-d-coat');
    expect(slugify('')).toBe('');
  });

  it('prettyStatus is human readable', () => {
    expect(prettyStatus('pending_payment')).toBe('Awaiting payment');
    expect(prettyStatus('paid')).toBe('Paid');
    expect(prettyStatus('something_else')).toBe('something_else');
  });
});
