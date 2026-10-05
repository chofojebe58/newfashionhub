/**
 * Payment gateway abstraction.
 *
 * The whole app talks to *this* module, never to a provider directly — which is
 * what makes swapping the demo gateway for Stripe a one-file change:
 * implement `createIntent` / `confirmIntent` for the `stripe` driver and set
 * PAYMENT_PROVIDER=stripe.
 *
 * SECURITY: a full card number is never logged, stored or returned. Only the
 * last four digits are persisted, and only after authorisation.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

export const PROVIDER = config.paymentProvider;

/** Card numbers that always behave a specific way (mirrors Stripe's test cards). */
const SCRIPTED_CARDS = {
  '4000000000000002': { status: 'declined', reason: 'Your card was declined.' },
  '4000000000009995': { status: 'declined', reason: 'Your card has insufficient funds.' },
  '4000000000000069': { status: 'declined', reason: 'Your card has expired.' },
  '4000000000000127': { status: 'declined', reason: 'Your card was declined (incorrect CVC).' },
  '4100000000000010': { status: 'declined', reason: 'Your card was flagged as fraudulent.' },
};

export function luhn(digits) {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function normaliseCard(card = {}) {
  const number = String(card.number ?? '').replace(/[\s-]/g, '');
  const exp = String(card.exp ?? '').replace(/\s/g, '');
  const cvc = String(card.cvc ?? '').replace(/\s/g, '');
  return { number, exp, cvc, name: String(card.name ?? '').trim() };
}

/** Shape-checks a card before it ever reaches a gateway. */
export function validateCard(card) {
  const { number, exp, cvc, name } = normaliseCard(card);

  if (!name) return { ok: false, reason: 'Name on card is required.' };
  if (!luhn(number)) return { ok: false, reason: 'That card number is not valid.' };

  const match = exp.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) return { ok: false, reason: 'Expiry must be in MM/YY format.' };

  const now = new Date();
  const expiry = new Date(2000 + Number(match[2]), Number(match[1]), 1);
  if (expiry <= new Date(now.getFullYear(), now.getMonth(), 1)) {
    return { ok: false, reason: 'That card has expired.' };
  }

  if (!/^\d{3,4}$/.test(cvc)) return { ok: false, reason: 'CVC must be 3 or 4 digits.' };

  return { ok: true, card: { number, exp, cvc, name } };
}

/* -------------------------------------------------------------------------- */
/* Demo driver                                                                 */
/* -------------------------------------------------------------------------- */

const demo = {
  name: 'demo',

  async createIntent({ orderId, amount, currency }) {
    return {
      id: `demo_pi_${crypto.randomBytes(12).toString('hex')}`,
      clientSecret: `demo_secret_${crypto.randomBytes(12).toString('hex')}`,
      amount,
      currency,
      orderId,
    };
  },

  async confirmIntent({ card }) {
    const check = validateCard(card);
    if (!check.ok) {
      return { status: 'declined', reason: check.reason, last4: null };
    }

    const last4 = check.card.number.slice(-4);
    const scripted = SCRIPTED_CARDS[check.card.number];

    if (scripted) {
      return { status: scripted.status, reason: scripted.reason, last4 };
    }

    // Anything else that passes Luhn is authorised, exactly like 4242 4242 4242 4242.
    return {
      status: 'succeeded',
      reason: null,
      last4,
      brand: guessBrand(check.card.number),
    };
  },
};

function guessBrand(number) {
  if (/^4/.test(number)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'mastercard';
  if (/^3[47]/.test(number)) return 'amex';
  if (/^6/.test(number)) return 'discover';
  return 'card';
}

/* -------------------------------------------------------------------------- */
/* Stripe driver (Phase 4b — needs STRIPE_SECRET_KEY)                          */
/* -------------------------------------------------------------------------- */

const stripe = {
  name: 'stripe',

  async _client() {
    if (!config.stripeSecretKey) {
      throw new Error('PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY');
    }
    // Imported lazily so the dependency stays optional in demo mode.
    const { default: Stripe } = await import('stripe');
    return new Stripe(config.stripeSecretKey);
  },

  async createIntent({ orderId, amount, currency }) {
    const client = await this._client();
    return client.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { orderId },
    });
  },

  async confirmIntent({ intentId }) {
    const client = await this._client();
    const intent = await client.paymentIntents.retrieve(intentId);
    return {
      status: intent.status === 'succeeded' ? 'succeeded' : 'declined',
      reason: intent.last_payment_error?.message ?? null,
      last4: intent.charges?.data?.[0]?.payment_method_details?.card?.last4 ?? null,
      brand: intent.charges?.data?.[0]?.payment_method_details?.card?.brand ?? null,
    };
  },
};

const drivers = { demo, stripe };

export const gateway = drivers[PROVIDER] ?? demo;

/** Human-readable label for the UI ("Demo mode — no payment is taken"). */
export function describeProvider() {
  return gateway.name === 'stripe'
    ? { provider: 'stripe', live: false, notice: null }
    : {
        provider: 'demo',
        live: false,
        notice:
          'Demo mode — card details are authorised by a simulated gateway and are never stored or charged. Use 4242 4242 4242 4242 to succeed.',
      };
}
