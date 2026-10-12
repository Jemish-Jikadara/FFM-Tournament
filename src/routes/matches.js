const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');
const wrap = require('../utils/wrap');
const { requireAuth } = require('../middleware/auth');
const { joinMatch, JoinError } = require('../services/match');
const { joinTournament, TournamentJoinError } = require('../services/tournamentJoin');
const { notify } = require('../services/notify');
const { MODES, FORMATS, STATUS_FILTERS } = require('../config/game');

const router = express.Router();

const FINISHED = ['COMPLETED', 'CANCELLED'];

// ============================================================
// LIST
// ============================================================
router.get('/', wrap(async (req, res) => {
  const mode = MODES.some((m) => m.slug === req.query.mode) ? req.query.mode : 'ALL';
  const format = FORMATS.includes(req.query.format) ? req.query.format : 'ALL';
  const status = STATUS_FILTERS.some((s) => s.value === req.query.status) ? req.query.status : 'ALL';

  const query = {};
  if (mode !== 'ALL') query.mode = mode;
  if (format !== 'ALL') query.matchFormat = format;
  let matches = await Match.find(query).sort({ matchStartAt: 1 }).limit(200);
  if (status !== 'ALL') matches = matches.filter((m) => m.displayStatus() === status);

  const live = matches.filter((m) => !FINISHED.includes(m.displayStatus()));
  const done = matches.filter((m) => FINISHED.includes(m.displayStatus())).reverse();
  matches = [...live, ...done];

  res.render('matches', {
    title: 'Tournament Arena', matches, filters: { mode, format, status },
    modes: MODES, formats: FORMATS, statuses: STATUS_FILTERS,
  });
}));

// ============================================================
// DETAIL
// ============================================================
router.get('/:id', wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  const match = await Match.findById(req.params.id).populate('registrations.user', 'profile');
  if (!match) return next();

  const isRegistered = !!req.user && match.isRegistered(req.user._id);
  const released = isRegistered && match.isRoomReleased();
  const room = released ? { id: match.roomId, password: match.roomPassword } : null;

  const isTournament = match.matchFormat === 'BR_SQUAD';

  // Players list (existing)
  const players = match.registrations.map((r, i) => ({
    slot: i + 1,
    team: Math.floor(i / (match.teamSize || 1)) + 1,
    name: r.user?.profile?.displayName || 'Player',
    ign: r.user?.profile?.freeFireName || '',
    uid: r.user?.profile?.freeFireUid || '',
    isMe: !!req.user && String(r.user?._id) === String(req.user._id),
  }));

  // ✅ Team-wise data for BR Squad
  let registeredTeams = [];
  if (isTournament) {
    const teamMap = {};
    match.registrations.forEach((r) => {
      if (!r.teamSlot) return;
      if (!teamMap[r.teamSlot]) {
        teamMap[r.teamSlot] = {
          slot: r.teamSlot,
          teamName: r.teamName,
          teamId: r.teamId,
          players: [],
        };
      }
      teamMap[r.teamSlot].players.push({
        name: r.user?.profile?.displayName || 'Player',
        ign: r.user?.profile?.freeFireName || '',
        uid: r.user?.profile?.freeFireUid || '',
        isIGL: r.isIGL,
        isMe: !!req.user && String(r.user?._id) === String(req.user._id),
      });
    });
    registeredTeams = Object.values(teamMap).sort((a, b) => a.slot - b.slot);
  }

  // ✅ Check if current user's team is already registered
  let myTeamRegistered = false;
  let myTeam = null;
  let myRoster = [];

  if (isTournament && req.user && req.user.isIGL()) {
    myTeam = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
    if (myTeam) {
      myTeamRegistered = match.teamRegistered(myTeam._id);
      if (!myTeamRegistered) {
        myRoster = await TeamMember.find({ team: myTeam._id, status: 'ACTIVE' })
          .populate('user', 'profile uidStatus role')
          .sort({ role: 1, joinedAt: 1 });
      }
    }
  }

  const results = (match.results || []).map((r) => {
    const p = match.registrations.find((x) => String(x.user?._id) === String(r.user));
    return {
      placement: r.placement,
      kills: r.kills,
      prizePaise: r.prizePaise,
      name: p?.user?.profile?.displayName || 'Player',
      ign: p?.user?.profile?.freeFireName || '',
    };
  }).sort((a, b) => a.placement - b.placement || b.kills - a.kills);

  res.render('match-detail', {
    title: `${match.modeName} · ${match.publicMatchCode}`,
    match, isRegistered, room, players, results,
    isTournament, registeredTeams,
    myTeam, myTeamRegistered, myRoster,
  });
}));

// ============================================================
// JOIN — REGULAR MATCH
// ============================================================
router.post('/:id/join', requireAuth, wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();

  const match = await Match.findById(req.params.id);
  if (match && match.matchFormat === 'BR_SQUAD') {
    res.flash('error', 'Use the team join button to join a BR Squad tournament.');
    return res.redirect(`/matches/${req.params.id}`);
  }

  try {
    await joinMatch(req.user, req.params.id);
    res.flash('success', 'Registration confirmed! You have joined this tournament match.');
  } catch (e) {
    if (e instanceof JoinError) res.flash('error', e.message);
    else throw e;
  }
  res.redirect(`/matches/${req.params.id}`);
}));

// ============================================================
// JOIN — BR SQUAD TOURNAMENT (IGL ONLY)
// ============================================================
router.post('/:id/join-tournament', requireAuth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.flash('error', 'Invalid match.');
    return res.redirect('/matches');
  }

  const teamName = String(req.body.team_name || '').trim();
  const selectedIds = Array.isArray(req.body.selected_players)
    ? req.body.selected_players
    : [req.body.selected_players].filter(Boolean);

  try {
    const { slot, teamName: finalName } = await joinTournament(req.user, req.params.id, {
      teamName,
      selectedUserIds: selectedIds,
    });

    await notify(req.user._id, 'Tournament Registered',
      `Your team "${finalName}" is registered. Slot #${slot}.`,
      `/matches/${req.params.id}`);

    res.flash('success', `Team "${finalName}" registered! Slot #${slot}.`);
  } catch (e) {
    if (e instanceof TournamentJoinError) res.flash('error', e.message);
    else throw e;
  }
  res.redirect(`/matches/${req.params.id}`);
}));
// ============================================================
// BR SQUAD — JOIN PAGE (IGL only)
// ============================================================
router.get('/:id/join-br', requireAuth, wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();

  const match = await Match.findById(req.params.id);
  if (!match) return next();

  if (match.matchFormat !== 'BR_SQUAD') {
    res.flash('error', 'This is not a BR Squad tournament.');
    return res.redirect('/matches/' + req.params.id);
  }

  if (!req.user.isIGL()) {
    res.flash('error', 'Only IGL accounts can join BR Squad tournaments.');
    return res.redirect('/matches/' + req.params.id);
  }

  // Check if can join
  if (!match.canJoin()) {
    res.flash('error', 'Registration is not open for this tournament.');
    return res.redirect('/matches/' + req.params.id);
  }

  // Check if already registered
  const Team = require('../models/Team');
  const TeamMember = require('../models/TeamMember');

  const myTeam = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (!myTeam) {
    res.flash('error', 'You need to create a team first.');
    return res.redirect('/team/create');
  }

  if (match.teamRegistered(myTeam._id)) {
    res.flash('info', 'Your team is already registered for this tournament.');
    return res.redirect('/matches/' + req.params.id);
  }

  const members = await TeamMember.find({ team: myTeam._id, status: 'ACTIVE' })
    .populate('user', 'profile email uidStatus role')
    .sort({ role: 1, joinedAt: 1 });

  res.render('match-join-br', {
    title: 'Join ' + match.modeName,
    match,
    team: myTeam,
    members,
    error: null,
  });
}));
module.exports = router;