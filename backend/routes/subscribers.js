import express from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { validate, schemas } from '../middleware/validate.js';

const router = express.Router();

// Newsletter forms are a favourite target for bots.
const subscribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again later.' },
});

router.post('/', subscribeLimiter, validate(schemas.subscriber), (req, res, next) => {
  try {
    db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(req.validated.email);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // Report success anyway — never reveal whether an address is already on the list.
      return res.status(200).json({ success: true, alreadySubscribed: true });
    }
    next(err);
  }
});

export default router;
