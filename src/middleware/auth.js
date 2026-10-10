const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const { ADMIN_ROLES } = require('../config/game');

const COOKIE = 'token';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax', // blocks cross-site form posts (CSRF)
    secure: env.isProd && process.env.COOKIE_SECURE !== 'false',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function signIn(res, user) {
  const token = jwt.sign({ id: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.cookie(COOKIE, token, cookieOptions());
}

function signOut(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax' });
}

// Runs on every page request: exposes `user`, `wallet`, `unread` to all views.
async function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.wallet = null;
  res.locals.unread = 0;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.id);
    if (!user || user.status !== 'ACTIVE') {
      signOut(res);
      return next();
    }
    req.user = user;
    res.locals.user = user;
    res.locals.wallet = await Wallet.findOne({ user: user._id });
    res.locals.unread = await Notification.countDocuments({ user: user._id, read: false });
  } catch {
    signOut(res);
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') res.flash('error', 'Please sign in to continue.');
  const back = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  res.redirect('/login' + back);
}

function requireRole(roles = ADMIN_ROLES) {
  return (req, res, next) => {
    if (!req.user) {
      res.flash('error', 'Please sign in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', { code: 403, message: 'You do not have permission to view this page.', layout: 'layouts/main' });
    }
    next();
  };
}

function guestOnly(req, res, next) {
  if (req.user) return res.redirect('/dashboard');
  next();
}

module.exports = { attachUser, requireAuth, requireRole, guestOnly, signIn, signOut };
