/**
 * Seeds the catalogue: 5 products + 40 size/colour variants.
 *
 * Safe to re-run, and importable: server.js calls `runSeed()` on boot when the
 * catalogue is empty so a fresh clone works with nothing but `npm run dev`.
 *
 *   node db/seed.js     # or: npm run db:seed
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));

const IMG = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const products = [
  {
    id: 'linen-blend-blazer',
    name: 'Linen Blend Blazer',
    price: 89.99,
    old_price: 129.99,
    image: IMG('photo-1529139574466-a303027c1d8b'),
    description:
      'A tailored, lightweight essential designed to bring structure and softness to your everyday wardrobe.',
    features: [
      'Premium linen blend texture',
      'Relaxed tailored fit',
      'Made for layering all season',
    ],
    rating: '★★★★★',
    reviews: '(124 reviews)',
    category: 'Women',
    stock: 50,
    featured: 1,
    created_at: '2026-01-12 09:00:00',
  },
  {
    id: 'ribbed-knit-top',
    name: 'Ribbed Knit Top',
    price: 25.99,
    old_price: 49.0,
    image: IMG('photo-1483985988355-763728e1935b'),
    description:
      'Soft-touch knitwear with a flattering silhouette that layers beautifully from work to weekend.',
    features: ['Breathable cotton blend', 'Stretch comfort fit', 'Elevated everyday staple'],
    rating: '★★★★★',
    reviews: '(98 reviews)',
    category: 'Tops',
    stock: 100,
    featured: 1,
    created_at: '2026-02-03 09:00:00',
  },
  {
    id: 'wide-leg-trousers',
    name: 'Wide Leg Trousers',
    price: 59.99,
    old_price: 85.99,
    image: IMG('photo-1524504388940-b1c1722653e1'),
    description:
      'Crafted to create a fluid silhouette with a polished finish that moves effortlessly through the day.',
    features: ['Soft drape fabric', 'Comfortable high-rise waist', 'Day-to-evening versatility'],
    rating: '★★★★★',
    reviews: '(181 reviews)',
    category: 'Women',
    stock: 75,
    featured: 1,
    created_at: '2026-03-18 09:00:00',
  },
  {
    id: 'leather-shoulder-bag',
    name: 'Leather Shoulder Bag',
    price: 79.99,
    old_price: 110.0,
    image: IMG('photo-1584917865442-de89df76afd3'),
    description:
      'A refined everyday companion with structured lines, room for essentials, and timeless appeal.',
    features: ['Full-grain leather finish', 'Spacious interior', 'Adjustable strap comfort'],
    rating: '★★★★★',
    reviews: '(112 reviews)',
    category: 'Bags',
    stock: 30,
    featured: 0,
    created_at: '2026-04-27 09:00:00',
  },
  {
    id: 'minimalist-strappy-heels',
    name: 'Minimalist Strappy Heels',
    price: 49.99,
    old_price: 79.0,
    image: IMG('photo-1517841905240-472988babdf9'),
    description:
      'A sleek statement heel with a refined profile that elevates evening wear and special occasions alike.',
    features: ['Comfort cushioned insole', 'Lightweight design', 'Elegant evening-ready finish'],
    rating: '★★★★★',
    reviews: '(164 reviews)',
    category: 'Shoes',
    stock: 40,
    featured: 0,
    created_at: '2026-05-09 09:00:00',
  },
  {
    id: 'oxford-cotton-shirt',
    name: 'Oxford Cotton Shirt',
    price: 45.0,
    old_price: 65.0,
    image: IMG('photo-1602810318383-e389cc2a3ccf'),
    description:
      'A crisp, breathable oxford with a clean collar roll — the backbone of an easy wardrobe.',
    features: ['Brushed cotton oxford', 'Relaxed through the body', 'Button-down collar'],
    rating: '★★★★☆',
    reviews: '(76 reviews)',
    category: 'Men',
    stock: 60,
    featured: 1,
    created_at: '2026-06-02 09:00:00',
  },
  {
    id: 'merino-crew-sweater',
    name: 'Merino Crew Sweater',
    price: 72.0,
    old_price: 95.0,
    image: IMG('photo-1614252369475-536eba743cae'),
    description:
      'Fine-gauge merino with a soft hand feel, cut to layer neatly over a shirt or under a coat.',
    features: ['100% extra-fine merino', 'Ribbed trims', 'Year-round weight'],
    rating: '★★★★★',
    reviews: '(58 reviews)',
    category: 'Men',
    stock: 45,
    featured: 0,
    created_at: '2026-06-20 09:00:00',
  },
  {
    id: 'selvedge-straight-jean',
    name: 'Selvedge Straight Jean',
    price: 98.0,
    old_price: null,
    image: IMG('photo-1542272604-787c3835535d'),
    description:
      'Rigid Japanese selvedge denim with a straight leg that breaks in exactly where you need it.',
    features: ['13.5oz Japanese selvedge', 'Straight leg, mid rise', 'Chain-stitched hems'],
    rating: '★★★★★',
    reviews: '(143 reviews)',
    category: 'Men',
    stock: 38,
    featured: 0,
    created_at: '2026-07-08 09:00:00',
  },
  {
    id: 'silk-slip-dress',
    name: 'Silk Slip Dress',
    price: 130.0,
    old_price: 180.0,
    image: IMG('photo-1595777457583-95e059d581b8'),
    description:
      'A bias-cut slip in washed silk that moves like water — dress it up or throw it over a tee.',
    features: ['Bias-cut washed silk', 'Adjustable straps', 'Falls to mid-calf'],
    rating: '★★★★★',
    reviews: '(67 reviews)',
    category: 'Dresses',
    stock: 26,
    featured: 1,
    created_at: '2026-07-25 09:00:00',
  },
];

const sizes = {
  apparel: ['XS', 'S', 'M', 'L', 'XL'],
  waist: ['24', '26', '28', '30', '32'],
  euShoe: ['36', '37', '38', '39', '40'],
  one: ['One Size'],
};

/** [productId, sizeSet, colours, prefix, stockBySize] */
const variantSpecs = [
  ['linen-blend-blazer', sizes.apparel, ['Beige', 'Black'], 'LBB', { XS: 5, S: 10, M: 15, L: 10, XL: 5 }],
  ['ribbed-knit-top', sizes.apparel.slice(0, 4), ['Cream', 'Black'], 'RKT', { XS: 20, S: 25, M: 30, L: 15 }],
  ['wide-leg-trousers', sizes.waist, ['Charcoal', 'Navy'], 'WLT', { 24: 8, 26: 12, 28: 15, 30: 12, 32: 8 }],
  ['leather-shoulder-bag', sizes.one, ['Tan', 'Black'], 'LSB', { 'One Size': 15 }],
  ['minimalist-strappy-heels', sizes.euShoe, ['Black', 'Nude'], 'MSH', { 36: 5, 37: 8, 38: 10, 39: 8, 40: 5 }],
];

const colourCode = {
  Beige: 'BEI', Black: 'BLK', Cream: 'CRM', Charcoal: 'CHA', Navy: 'NAV',
  Tan: 'TAN', Nude: 'NUD',
};

const sizeCode = (size) =>
  size === 'One Size' ? 'OS' : /^\d+$/.test(size) ? size : size;

const variants = variantSpecs.flatMap(([productId, sizeList, colours, prefix, stockBySize]) =>
  colours.flatMap((color) =>
    sizeList.map((size) => ({
      product_id: productId,
      size,
      color,
      sku: `${prefix}-${colourCode[color] || color.slice(0, 3).toUpperCase()}-${sizeCode(size)}`,
      stock: stockBySize[size] ?? 0,
    }))
  )
);

/**
 * Idempotent: products are upserted, variants are inserted only if the SKU is new.
 *
 * Statements are prepared lazily, inside the transaction. Preparing at module
 * scope would throw "no such table: products" when server.js imports this file
 * before the migrations have run on a fresh database.
 */
export const seed = db.transaction(() => {
  const insertProduct = db.prepare(`
  INSERT INTO products
    (id, name, price, old_price, image, description, features, rating, reviews,
     category, stock, created_at, published, featured, gallery)
  VALUES
    (@id, @name, @price, @old_price, @image, @description, @features, @rating, @reviews,
     @category, @stock, @created_at, 1, @featured, '[]')
  ON CONFLICT(id) DO UPDATE SET
    name        = excluded.name,
    price       = excluded.price,
    old_price   = excluded.old_price,
    image       = excluded.image,
    description = excluded.description,
    features    = excluded.features,
    rating      = excluded.rating,
    reviews     = excluded.reviews,
    category    = excluded.category,
    stock       = excluded.stock,
    updated_at  = CURRENT_TIMESTAMP
`);

  const insertVariant = db.prepare(`
  INSERT OR IGNORE INTO product_variants (product_id, size, color, sku, stock)
  VALUES (@product_id, @size, @color, @sku, @stock)
`);


  for (const product of products) {
    insertProduct.run({
      ...product,
      features: JSON.stringify(product.features),
      featured: product.featured ?? 0,
    });
  }
  for (const variant of variants) {
    insertVariant.run(variant);
  }
});

export function runSeed() {
  seed();
  return { products: products.length, variants: variants.length };
}

/** False when the schema has not been created yet, so callers can skip safely. */
export function catalogueIsEmpty() {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'`)
    .get();
  if (!table) return false;
  return db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0;
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(here, 'seed.js');

if (isDirectRun) {
  const counts = runSeed();
  console.log(`✓ Seeded ${counts.products} products and ${counts.variants} variants into ${db.name}`);
  db.close();
}
