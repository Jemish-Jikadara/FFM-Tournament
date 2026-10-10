const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const wrap = require('../utils/wrap');
const { requireAuth } = require('../middleware/auth');
const { joinMatch, JoinError } = require('../services/match');
const { MODES, FORMATS, STATUS_FILTERS } = require('../config/game');

const router = express.Router();

const FINISHED = ['COMPLETED', 'CANCELLED'];

router.get('/', wrap(async (req, res) => {
  const mode = MODES.some((m) => m.slug === req.query.mode) ? req.query.mode : 'ALL';
  const format = FORMATS.includes(req.query.format) ? req.query.format : 'ALL';
  const status = STATUS_FILTERS.some((s) => s.value === req.query.status) ? req.query.status : 'ALL';

  const query = {};
  if (mode !== 'ALL') query.mode = mode;
  if (format !== 'ALL') query.matchFormat = format;
  let matches = await Match.find(query).sort({ matchStartAt: 1 }).limit(200);
  if (status !== 'ALL') matches = matches.filter((m) => m.displayStatus() === status);

  // Open/upcoming first (soonest first), finished matches last (newest first)
  const live = matches.filter((m) => !FINISHED.includes(m.displayStatus()));
  const done = matches.filter((m) => FINISHED.includes(m.displayStatus())).reverse();
  matches = [...live, ...done];

  res.render('matches', {
    title: 'Tournament Arena', matches, filters: { mode, format, status },
    modes: MODES, formats: FORMATS, statuses: STATUS_FILTERS,
  });
}));

router.get('/:id', wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  const match = await Match.findById(req.params.id).populate('registrations.user', 'profile');
  if (!match) return next();

  const isRegistered = !!req.user && match.isRegistered(req.user._id);
  const released = isRegistered && match.isRoomReleased();
  const room = released ? { id: match.roomId, password: match.roomPassword } : null;

  // Auto-allocated teams by join order (slot 1..N)
  const players = match.registrations.map((r, i) => ({
    slot: i + 1,
    team: Math.floor(i / (match.teamSize || 1)) + 1,
    name: r.user?.profile?.displayName || 'Player',
    ign: r.user?.profile?.freeFireName || '',
    uid: r.user?.profile?.freeFireUid || '',
    isMe: !!req.user && String(r.user?._id) === String(req.user._id),
  }));

  const results = (match.results || []).map((r) => {
    const p = match.registrations.find((x) => String(x.user?._id) === String(r.user));
    return { placement: r.placement, kills: r.kills, prizePaise: r.prizePaise, name: p?.user?.profile?.displayName || 'Player', ign: p?.user?.profile?.freeFireName || '' };
  }).sort((a, b) => a.placement - b.placement || b.kills - a.kills);

  res.render('match-detail', { title: `${match.modeName} · ${match.publicMatchCode}`, match, isRegistered, room, players, results });
}));

router.post('/:id/join', requireAuth, wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  try {
    await joinMatch(req.user, req.params.id);
    res.flash('success', 'Registration confirmed! You have joined this tournament match.');
  } catch (e) {
    if (e instanceof JoinError) res.flash('error', e.message);
    else throw e;
  }
  res.redirect(`/matches/${req.params.id}`);
}));

module.exports = router;
