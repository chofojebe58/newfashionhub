import jwt from 'jsonwebtoken';
import { config } from '../config.js';

function readToken(req) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Rejects the request unless it carries a valid bearer token. */
export function authMiddleware(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch (err) {
    const message = err?.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
export function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      /* ignore — treat as guest */
    }
  }
  next();
}

/** Requires an authenticated user whose role is in `roles`. Use after authMiddleware. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export const requireAdmin = [authMiddleware, requireRole('admin')];

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'customer' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}
