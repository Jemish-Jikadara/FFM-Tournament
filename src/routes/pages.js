const express = require('express');
const Match = require('../models/Match');
const User = require('../models/User');
const wrap = require('../utils/wrap');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const matches = await Match.find({ status: 'ACTIVE', matchStartAt: { $gt: new Date() } }).sort({ matchStartAt: 1 }).limit(4);
  res.render('home', { title: 'Compete. Play. Win.', matches });
}));

router.get('/leaderboard', wrap(async (req, res) => {
  const rankings = await User.find({ status: 'ACTIVE', 'profile.totalMatches': { $gt: 0 } })
    .sort({ 'profile.totalWinningsPaise': -1, 'profile.totalWins': -1 })
    .limit(50)
    .select('profile');
  res.render('leaderboard', { title: 'Leaderboard', rankings });
}));

router.get('/rules', (req, res) => res.render('rules', { title: 'Tournament Rules' }));
router.get('/terms', (req, res) => res.render('terms', { title: 'Terms of Service' }));
router.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy Policy' }));

module.exports = router;
