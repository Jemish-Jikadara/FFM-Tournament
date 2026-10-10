const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const Dispute = require('../models/Dispute');
const wrap = require('../utils/wrap');
const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const walletSvc = require('../services/wallet');
const { notify } = require('../services/notify');
const { rupeesToPaise, paise } = require('../utils/format');

const router = express.Router();
router.use(['/dashboard', '/my-matches', '/profile', '/wallet', '/notifications', '/disputes'], requireAuth);

const stateOf = (m) => m.displayStatus();
const LIVE = ['ROOM_READY', 'IN_PROGRESS'];
const DONE = ['COMPLETED', 'CANCELLED'];

async function myMatches(userId) {
  return Match.find({ 'registrations.user': userId }).sort({ matchStartAt: 1 }).limit(200);
}

router.get('/dashboard', wrap(async (req, res) => {
  const all = await myMatches(req.user._id);
  const live = all.filter((m) => LIVE.includes(stateOf(m)));
  const upcoming = all.filter((m) => !LIVE.includes(stateOf(m)) && !DONE.includes(stateOf(m)));
  const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5);
  res.render('dashboard', { title: 'Dashboard', live, upcoming, transactions });
}));

router.get('/my-matches', wrap(async (req, res) => {
  const all = await myMatches(req.user._id);
  const tab = ['UPCOMING', 'LIVE', 'COMPLETED', 'ALL'].includes(req.query.tab) ? req.query.tab : 'UPCOMING';
  const groups = {
    LIVE: all.filter((m) => LIVE.includes(stateOf(m))),
    UPCOMING: all.filter((m) => !LIVE.includes(stateOf(m)) && !DONE.includes(stateOf(m))),
    COMPLETED: all.filter((m) => DONE.includes(stateOf(m))).reverse(),
    ALL: all,
  };
  res.render('my-matches', {
    title: 'My Matches', tab, matches: groups[tab],
    counts: { UPCOMING: groups.UPCOMING.length, LIVE: groups.LIVE.length, COMPLETED: groups.COMPLETED.length, ALL: all.length },
  });
}));

// ---------- profile ----------
router.get('/profile', (req, res) => res.render('profile', { title: 'My Profile', error: null }));

router.post('/profile', wrap(async (req, res) => {
  const displayName = String(req.body.display_name || '').trim();
  const uid = String(req.body.free_fire_uid || '').trim();
  const ign = String(req.body.free_fire_name || '').trim();
  const fail = (msg) => { res.flash('error', msg); res.redirect('/profile'); };

  if (displayName.length < 2 || displayName.length > 30) return fail('Display name must be 2-30 characters.');
  if (!/^\d{5,15}$/.test(uid)) return fail('Free Fire UID must be 5-15 digits.');
  if (ign.length < 2 || ign.length > 40) return fail('Enter your exact Free Fire nickname.');

  const u = req.user;
  if (uid !== u.profile.freeFireUid) {
    if (await User.exists({ 'profile.freeFireUid': uid, _id: { $ne: u._id } })) return fail('This Free Fire UID is already linked to another account.');
    u.uidStatus = 'PENDING';
    u.uidNotes = '';
  }
  u.profile.displayName = displayName;
  u.profile.freeFireUid = uid;
  u.profile.freeFireName = ign;
  await u.save();
  res.flash('success', 'Profile updated.');
  res.redirect('/profile');
}));

router.post('/profile/password', wrap(async (req, res) => {
  const { current_password: cur, new_password: next } = req.body;
  if (!(await bcrypt.compare(String(cur || ''), req.user.passwordHash))) {
    res.flash('error', 'Current password is incorrect.');
    return res.redirect('/profile');
  }
  if (String(next || '').length < 6) {
    res.flash('error', 'New password must be at least 6 characters.');
    return res.redirect('/profile');
  }
  req.user.passwordHash = await bcrypt.hash(String(next), 12);
  await req.user.save();
  res.flash('success', 'Password changed.');
  res.redirect('/profile');
}));

// ---------- wallet ----------
router.get('/wallet', wrap(async (req, res) => {
  const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.render('wallet', { title: 'Wallet', transactions, testMode: env.testModeDeposits });
}));

router.post('/wallet/deposit', wrap(async (req, res) => {
  const back = req.body.back === 'dashboard' ? '/dashboard' : '/wallet';
  if (!env.testModeDeposits) {
    res.flash('error', 'Online payments are not enabled yet.');
    return res.redirect(back);
  }
  const amount = rupeesToPaise(req.body.amount);
  if (!(amount >= 1000 && amount <= 1000000)) {
    res.flash('error', 'Deposit must be between ₹10 and ₹10,000.');
    return res.redirect(back);
  }
  await walletSvc.credit(req.user._id, amount, {
    bucket: 'available', type: 'DEPOSIT', description: 'Test-mode deposit (no real payment)', referenceType: 'DEPOSIT',
    idempotencyKey: `DEPOSIT:${req.user._id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  });
  await notify(req.user._id, 'Cash added', `${paise(amount)} was added to your wallet.`, '/wallet');
  res.flash('success', `${paise(amount)} added to your wallet.`);
  res.redirect(back);
}));

router.post('/wallet/withdraw', wrap(async (req, res) => {
  const back = req.body.back === 'dashboard' ? '/dashboard' : '/wallet';
  const amount = rupeesToPaise(req.body.amount);
  const upi = String(req.body.upi || '').trim();
  if (!(amount >= 5000)) { res.flash('error', 'Minimum withdrawal is ₹50.'); return res.redirect(back); }
  if (!/^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/.test(upi)) { res.flash('error', 'Enter a valid UPI ID (e.g. name@upi).'); return res.redirect(back); }
  const w = await walletSvc.requestWithdrawal(req.user._id, amount, upi);
  if (!w) { res.flash('error', 'Insufficient winning balance. Only prize winnings can be withdrawn.'); return res.redirect(back); }
  await notify(req.user._id, 'Withdrawal requested', `${paise(amount)} to ${upi} is pending review.`, '/wallet');
  res.flash('success', 'Withdrawal request submitted for review.');
  res.redirect(back);
}));

// ---------- notifications ----------
router.get('/notifications', wrap(async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.render('notifications', { title: 'Notifications', items });
}));

router.post('/notifications/read-all', wrap(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.redirect('/notifications');
}));

router.post('/notifications/:id/read', wrap(async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) {
    await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
  }
  res.redirect(req.body.to && req.body.to.startsWith('/') && !req.body.to.startsWith('//') ? req.body.to : '/notifications');
}));

// ---------- disputes ----------
router.get('/disputes', wrap(async (req, res) => {
  const [disputes, matches] = await Promise.all([
    Dispute.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('match', 'publicMatchCode modeName'),
    myMatches(req.user._id),
  ]);
  res.render('disputes', { title: 'Dispute Support', disputes, matches });
}));

router.post('/disputes', wrap(async (req, res) => {
  const { match_id: matchId, type, description } = req.body;
  const desc = String(description || '').trim();
  if (desc.length < 10) { res.flash('error', 'Please describe the issue in at least 10 characters.'); return res.redirect('/disputes'); }
  let match;
  if (matchId) {
    if (!mongoose.isValidObjectId(matchId)) { res.flash('error', 'Invalid match.'); return res.redirect('/disputes'); }
    match = await Match.findOne({ _id: matchId, 'registrations.user': req.user._id });
    if (!match) { res.flash('error', 'You can only raise disputes for matches you joined.'); return res.redirect('/disputes'); }
  }
  await Dispute.create({
    user: req.user._id, match: match?._id,
    type: ['RESULT', 'TEAM_ASSIGNMENT', 'PAYMENT', 'CHEATING', 'OTHER'].includes(type) ? type : 'OTHER',
    description: desc.slice(0, 2000),
  });
  res.flash('success', 'Dispute submitted. Our team will review it shortly.');
  res.redirect('/disputes');
}));

module.exports = router;
