import { z } from 'zod';
import { SETTING_KEYS, URL_SETTINGS } from '../services/settings.js';

/**
 * Runs `schema` against `req[source]`, puts the parsed (and transformed) value
 * on `req.validated`, or responds 400 with a flattened error map.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: result.error.flatten(),
      });
    }
    req.validated = result.data;
    next();
  };
}

/** Email addresses are stored lower-cased and trimmed so UNIQUE works reliably. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be under 72 characters'); // bcrypt truncates beyond this

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(80);

/**
 * Optional-but-normalised: absent → '', present-but-empty → validation error.
 *
 * Note `.optional().default('')` does NOT work here — Zod validates the default
 * value against the inner schema, so '' would fail `min(1)`.
 */
const optionalNameSchema = nameSchema.optional().transform((value) => value ?? '');

/**
 * For *updating* a profile an empty string is meaningful — it clears the name.
 * Registration and the storefront both allow a person with only one name, so
 * refusing to save such a profile made those names impossible to edit.
 */
const updatableNameSchema = z.string().trim().max(80).optional();

const priceSchema = z.number().nonnegative().max(1_000_000);

const productIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');

/** Accepts true/false, 1/0 and "true"/"false" — checkboxes and JSON both arrive here. */
const booleanish = z.union([
  z.boolean(),
  z.number().int().min(0).max(1),
  z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'),
]);

const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value.startsWith('/') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:image/'),
    'Image must be a URL or a relative path'
  );

/** A relative href such as `shop.html#featured`, or an absolute http(s) URL. */
const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value === '' ||
      value.startsWith('#') ||
      value.startsWith('/') ||
      /^[a-z0-9-]+\.html/.test(value) ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('mailto:'),
    'Link must be relative, a hash, or an http(s)/mailto URL'
  );

export { SETTING_KEYS, URL_SETTINGS, linkSchema };

export const schemas = {
  register: z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: optionalNameSchema,
    lastName: optionalNameSchema,
  }),

  login: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),

  registerAdmin: z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: optionalNameSchema,
    lastName: optionalNameSchema,
    setupKey: z.string().max(200).optional(),
  }),

  cartItem: z.object({
    productId: z.string().min(1),
    variantId: z.number().int().positive().optional(),
    quantity: z.number().int().min(1).max(99),
  }),

  cartQuantity: z.object({
    quantity: z.number().int().min(0).max(99),
  }),

  checkout: z.object({
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    address: z.string().trim().min(1, 'Required').max(240),
    city: z.string().trim().min(1, 'Required').max(80),
    postalCode: z.string().trim().min(1, 'Required').max(20),
    country: z.string().trim().length(2, 'Use a 2-letter country code').toUpperCase().default('US'),
    paymentMethodId: z.string().max(200).optional(),
  }),

  subscriber: z.object({
    email: emailSchema,
  }),

  /**
   * Card details for the demo gateway.
   *
   * Validated, used once to authorise, and discarded — only `last4` is stored.
   * When Stripe is switched on, this is replaced by a PaymentMethod id created
   * by Stripe Elements in the browser, so no PAN ever reaches this server.
   */
  payOrder: z.object({
    card: z.object({
      name: z.string().trim().min(1, 'Name on card is required').max(120),
      number: z.string().transform((v) => v.replace(/[\s-]/g, '')).pipe(
        z.string().regex(/^\d{12,19}$/, 'Enter a valid card number')
      ),
      exp: z.string().trim().regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, 'Use MM/YY'),
      cvc: z.string().trim().regex(/^\d{3,4}$/, 'CVC must be 3 or 4 digits'),
    }),
  }),

  updateProfile: z
    .object({
      firstName: updatableNameSchema,
      lastName: updatableNameSchema,
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: passwordSchema,
  }),

  wishlistAdd: z.object({
    productId: z.string().trim().min(1).max(80),
  }),

  userRole: z.object({
    role: z.enum(['admin', 'customer']),
  }),

  category: z.object({
    name: z.string().trim().min(1, 'A category needs a name').max(60),
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
      .optional(),
    description: z.string().trim().max(500).optional(),
    image: imageUrlSchema.nullish().or(z.literal('')),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    published: booleanish.default(true),
  }),

  categoryUpdate: z
    .object({
      name: z.string().trim().min(1).max(60).optional(),
      slug: z
        .string()
        .trim()
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
        .optional(),
      description: z.string().trim().max(500).nullish(),
      image: imageUrlSchema.nullish().or(z.literal('')),
      sortOrder: z.number().int().min(0).max(100000).optional(),
      published: booleanish.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' }),

  /**
   * Mirrors the `products` table. Keep in sync with frontend/src/types/product.ts
   *
   * `POST /api/admin/products` is an upsert, so only `id` is required here;
   * the route enforces `name` + `price` when the product does not exist yet.
   * Omitted keys are left untouched on update (see PRODUCT_COLUMNS in the route).
   */
  product: z.object({
    id: productIdSchema,
    name: z.string().trim().min(1).max(140).optional(),
    price: priceSchema.optional(),
    old_price: priceSchema.nullish(),
    image: imageUrlSchema.nullish().or(z.literal('')),
    description: z.string().trim().max(4000).nullish(),
    features: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    rating: z.string().trim().max(40).nullish(),
    reviews: z.string().trim().max(80).nullish(),
    category: z.string().trim().min(1).max(60).nullish(),
    stock: z.number().int().min(0).max(1_000_000).default(0),
    gallery: z.array(imageUrlSchema).max(6).default([]),
    published: booleanish.default(true),
    featured: booleanish.default(false),
  }),

  /**
   * Replaces a product's variant set. The admin UI builds the size × colour
   * matrix and sends the resulting rows; SKUs are optional and auto-generated
   * when omitted.
   */
  variantSet: z.object({
    variants: z
      .array(
        z.object({
          size: z.string().trim().min(1).max(30),
          color: z.string().trim().min(1).max(30),
          sku: z.string().trim().max(40).nullish(),
          stock: z.number().int().min(0).max(1_000_000).default(0),
        })
      )
      .max(500),
  }),

  /**
   * Only keys declared in services/settings.js are accepted, and the ones that
   * hold links/images are checked as such so a typo cannot break the homepage.
   */
  settings: z
    .object(Object.fromEntries(SETTING_KEYS.map((key) => [key, z.string().max(2000).optional()])))
    // `.strict()` so a stale admin UI fails loudly instead of silently dropping keys.
    .strict()
    .refine((data) => Object.keys(data).length > 0, { message: 'No settings provided' })
    .superRefine((data, ctx) => {
      for (const key of Object.keys(data)) {
        const value = data[key];
        if (!URL_SETTINGS.has(key) || value === '' || value == null) continue;
        const parsed = linkSchema.safeParse(value);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: parsed.error.issues[0]?.message ?? 'Invalid link',
          });
        }
      }
    }),

  productQuery: z.object({
    category: z.string().optional(),
    search: z.string().max(120).optional(),
    featured: booleanish.optional(),
    sort: z.enum(['name', 'price-asc', 'price-desc', 'newest']).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
};
