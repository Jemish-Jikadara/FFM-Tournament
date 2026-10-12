const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const wrap = require('../utils/wrap');
const { signIn, signOut, guestOnly } = require('../middleware/auth');
const walletSvc = require('../services/wallet');
const { notify } = require('../services/notify');
const { PUBLIC_ROLES } = require('../config/game');

const router = express.Router();


// ============================================================
// RATE LIMITER
// ============================================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const view = req.path === '/register' ? 'register' : 'login';
    res.status(429).render(view, {
      title: 'Too many attempts',
      error: 'Too many attempts. Please wait a few minutes and try again.',
      form: {},
      next: '',
      publicRoles: PUBLIC_ROLES,
    });
  },
});


// ============================================================
// HELPERS
// ============================================================
const safeNext = (n) =>
  typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '';


// ============================================================
// LOGIN — GET
// ============================================================
router.get('/login', guestOnly, (req, res) => {
  res.render('login', {
    title: 'Sign In',
    error: null,
    form: {},
    next: safeNext(req.query.next),
  });
});


// ============================================================
// LOGIN — POST
// ============================================================
router.post(
  '/login',
  guestOnly,
  limiter,
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const next = safeNext(req.body.next);

    const fail = (msg, code = 401) =>
      res.status(code).render('login', {
        title: 'Sign In',
        error: msg,
        form: { email },
        next,
      });

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      return fail(
        `Your account is ${user.status.toLowerCase()}. Please contact support.`,
        403
      );
    }

    user.lastLoginAt = new Date();
    await user.save();

    signIn(res, user);

    const defaultRedirect = user.isAdmin() ? '/admin/dashboard' : '/dashboard';
    res.redirect(next || defaultRedirect);
  })
);


// ============================================================
// REGISTER — GET
// ============================================================
router.get('/register', guestOnly, (req, res) => {
  res.render('register', {
    title: 'Create Account',
    error: null,
    form: {},
    publicRoles: PUBLIC_ROLES,
  });
});


// ============================================================
// REGISTER — POST
// ============================================================
router.post(
  '/register',
  guestOnly,
  limiter,
  wrap(async (req, res) => {
    const b = req.body;

    const form = {
      displayName: String(b.display_name || '').trim(),
      email: String(b.email || '').trim().toLowerCase(),
      phone: String(b.phone || '').trim(),
      uid: String(b.free_fire_uid || '').trim(),
      ign: String(b.free_fire_name || '').trim(),
      role: String(b.role || 'PLAYER').trim().toUpperCase(),
    };

    const password = String(b.password || '');

    const fail = (msg) =>
      res.status(400).render('register', {
        title: 'Create Account',
        error: msg,
        form,
        publicRoles: PUBLIC_ROLES,
      });

    // -------- Role validation --------
    const allowedRoles = PUBLIC_ROLES.map((r) => r.value);
    if (!allowedRoles.includes(form.role)) {
      form.role = 'PLAYER';
    }

    // -------- Field validation --------
    if (form.displayName.length < 2 || form.displayName.length > 30) {
      return fail('Display name must be 2-30 characters.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return fail('Please enter a valid email address.');
    }

    if (!/^\d{5,15}$/.test(form.uid)) {
      return fail('Free Fire UID must be 5-15 digits.');
    }

    if (form.ign.length < 2 || form.ign.length > 40) {
      return fail('Enter your exact Free Fire nickname.');
    }

    if (password.length < 6) {
      return fail('Password must be at least 6 characters.');
    }

    if (form.phone && !/^[0-9+\-\s]{7,15}$/.test(form.phone)) {
      return fail('Enter a valid phone number or leave it blank.');
    }

    // -------- Duplicate checks --------
    if (await User.exists({ email: form.email })) {
      return fail('This email is already registered.');
    }

    if (form.phone && (await User.exists({ phone: form.phone }))) {
      return fail('This phone number is already registered.');
    }

    if (await User.exists({ 'profile.freeFireUid': form.uid })) {
      return fail('This Free Fire UID is already linked to another account.');
    }

    // -------- Create user --------
    const user = await User.create({
      email: form.email,
      phone: form.phone || undefined,
      passwordHash: await bcrypt.hash(password, 12),
      role: form.role,
      profile: {
        displayName: form.displayName,
        freeFireUid: form.uid,
        freeFireName: form.ign,
      },
    });

    await walletSvc.ensureWallet(user._id);

    // -------- Welcome notification --------
    const roleMsg =
      form.role === 'IGL'
        ? 'Your IGL account is ready. Head to your team dashboard to create your squad.'
        : 'Your account is ready. Your Free Fire UID is pending admin verification.';

    const notifyLink = form.role === 'IGL' ? '/team/manage' : '/profile';

    await notify(user._id, 'Welcome to FFM', roleMsg, notifyLink);

    // -------- Sign in and redirect --------
    signIn(res, user);

    const successMsg =
      form.role === 'IGL'
        ? 'Account created! Welcome to FFM as IGL.'
        : 'Account created! Welcome to FFM.';

    res.flash('success', successMsg);

    const redirectTo = form.role === 'IGL' ? '/team/manage' : '/dashboard';
    res.redirect(redirectTo);
  })
);


// ============================================================
// LOGOUT
// ============================================================
router.post('/logout', (req, res) => {
  signOut(res);
  res.flash('success', 'You have been signed out.');
  res.redirect('/');
});


module.exports = router;