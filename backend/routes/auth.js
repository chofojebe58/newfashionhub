import express from 'express';
import { validate, schemas } from '../middleware/validate.js';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { mergeGuestCartIntoUser } from '../services/cart.js';
import {
  adminAccessState,
  authenticate,
  changePassword,
  createAdmin,
  createUser,
  findById,
  updateProfile,
} from '../services/accounts.js';

/**
 * Thin HTTP layer over services/accounts.js — validation in, DTO out.
 * Every account rule (passwords, roles, the admin bootstrap) lives in the
 * service, so the admin panel and the storefront can never disagree.
 */
const router = express.Router();

/** Attaches this browser's guest cart to the account, if there is one. */
function adoptGuestCart(req, user) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return { merged: 0 };
  return mergeGuestCartIntoUser(String(sessionId), user.id);
}

router.post('/register', validate(schemas.register), (req, res, next) => {
  try {
    const { email, password, firstName, lastName } = req.validated;
    const user = createUser({ email, password, firstName, lastName });
    const cart = adoptGuestCart(req, user);

    res.status(201).json({ token: signToken(user), user, cartMerged: cart.merged });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post('/login', validate(schemas.login), (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const { token, user } = authenticate(email, password);
    const cart = adoptGuestCart(req, user);

    res.json({ token, user, cartMerged: cart.merged });
  } catch (err) {
    if (err.code === 'AUTH_FAILED') return res.status(401).json({ error: err.message });
    next(err);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = findById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

/** Update the signed-in user's name. A blank value clears that name. */
router.patch('/me', authMiddleware, validate(schemas.updateProfile), (req, res) => {
  const { firstName, lastName } = req.validated;
  res.json({ user: updateProfile(req.user.userId, { firstName, lastName }) });
});

/** Change the password. Requires the current one, and re-issues the token. */
router.post('/password', authMiddleware, validate(schemas.changePassword), (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.validated;
    const { user, token } = changePassword(req.user.userId, currentPassword, newPassword);
    res.json({ user, token });
  } catch (err) {
    if (err.code === 'WRONG_PASSWORD') return res.status(401).json({ error: err.message });
    if (err.code === 'PASSWORD_REUSED') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Admin bootstrap — see services/accounts.js for the rules                    */
/* -------------------------------------------------------------------------- */

/** Tells the admin gate what it may offer, without leaking admin counts. */
router.get('/admin-setup', (req, res) => {
  res.json(adminAccessState());
});

router.post('/register-admin', validate(schemas.registerAdmin), (req, res, next) => {
  try {
    const { email, password, firstName, lastName, setupKey } = req.validated;
    const { user, token, promotedExisting } = createAdmin({
      email,
      password,
      firstName,
      lastName,
      setupKey,
    });
    const cart = adoptGuestCart(req, user);

    res
      .status(promotedExisting ? 200 : 201)
      .json({ token, user, cartMerged: cart.merged, promotedExisting });
  } catch (err) {
    if (err.code === 'BAD_SETUP_KEY' || err.code === 'ADMIN_SIGNUP_CLOSED') {
      return res.status(403).json({ error: err.message });
    }
    if (err.code === 'EMAIL_TAKEN') return res.status(409).json({ error: err.message });
    next(err);
  }
});

export default router;
