const express = require('express');
const mongoose = require('mongoose');
const os = require('os');
const User = require('../models/User');
const Match = require('../models/Match');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const AuditLog = require('../models/AuditLog');
const wrap = require('../utils/wrap');
const { requireRole } = require('../middleware/auth');

const SystemSettings = require('../models/SystemSettings');
const { notify, audit } = require('../services/notify');
const { cancelMatch, settleMatch } = require('../services/match');
const { fromInput, rupeesToPaise, paise } = require('../utils/format');
const { uploadPointTable, deleteImage } = require('../services/cloudinary');
const { MODES, MAPS, ROLES, USER_STATUSES, modeBySlug } = require('../config/game');

const router = express.Router();

const STAFF = ['ADMIN', 'SUPER_ADMIN', 'MATCH_HOST'];
const OWNERS = ['ADMIN', 'SUPER_ADMIN'];
const SUPPORTERS = ['ADMIN', 'SUPER_ADMIN', 'MATCH_HOST', 'SUPPORT'];

const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: 'layout-dashboard', roles: STAFF },
  { key: 'health', label: 'Live System Health', href: '/admin/health', icon: 'shield', roles: STAFF },
  { key: 'matches', label: 'Matches', href: '/admin/matches', icon: 'swords', roles: STAFF },
  { key: 'create', label: 'Create Match', href: '/admin/matches/create', icon: 'circle-plus', roles: STAFF },
  { key: 'results', label: 'Result Verification', href: '/admin/results', icon: 'trophy', roles: STAFF },
  { key: 'identities', label: 'UID Verification', href: '/admin/gaming-identities', icon: 'users', roles: SUPPORTERS },
  { key: 'system', label: 'System Controls', href: '/admin/system', icon: 'settings', roles: ['SUPER_ADMIN'] },
  { key: 'disputes', label: 'Disputes', href: '/admin/disputes', icon: 'triangle-alert', roles: SUPPORTERS },
  { key: 'users', label: 'User Accounts', href: '/admin/users', icon: 'users', roles: OWNERS },
  { key: 'audit', label: 'Audit Logs', href: '/admin/audit-logs', icon: 'file-text', roles: OWNERS },
  { key: 'risk', label: 'Risk Telemetry', href: '/admin/risk-flags', icon: 'shield-alert', roles: OWNERS },
];

// Every admin page renders inside the admin shell; `active` highlights the sidebar.
router.use((req, res, next) => {
  res.locals.adminNav = ADMIN_NAV.filter((n) => req.user && n.roles.includes(req.user.role));
  res.locals.active = '';
  next();
});

const idOk = (id) => mongoose.isValidObjectId(id);
const back = (res, url, type, msg) => { res.flash(type, msg); res.redirect(url); };

// ============ DASHBOARD ============
router.get('/dashboard', requireRole(STAFF), wrap(async (req, res) => {
  const [users, matches, openDisputes, pendingUids, pendingWithdrawals, dep] = await Promise.all([
    User.countDocuments(),
    Match.countDocuments(),
    Dispute.countDocuments({ status: 'OPEN' }),
    User.countDocuments({ uidStatus: 'PENDING' }),
    Transaction.find({ type: 'WITHDRAWAL', status: 'PENDING' }).sort({ createdAt: 1 }).populate('user', 'email profile'),
    Transaction.find({ type: 'DEPOSIT', status: 'COMPLETED' }).select('amountPaise'),
  ]);
  const all = await Match.find().select('status registrationCount maxPlayers roomReleaseAt matchStartAt registrationCloseAt registrationStartAt').limit(500);
  const activeMatches = all.filter((m) => !['COMPLETED', 'CANCELLED'].includes(m.displayStatus())).length;
  const needsResult = all.filter((m) => (m.status === 'ACTIVE' && m.displayStatus() === 'IN_PROGRESS') || m.status === 'RESULT_SUBMITTED').length;
  const deposits = dep.reduce((s, t) => s + t.amountPaise, 0);
  const recent = await Match.find().sort({ createdAt: -1 }).limit(5);
  res.render('admin/dashboard', {
    title: 'Admin Dashboard', active: 'dashboard',
    stats: { users, matches, activeMatches, needsResult, openDisputes, pendingUids, deposits },
    withdrawals: pendingWithdrawals, recent, canPay: OWNERS.includes(req.user.role),
  });
}));

router.post('/withdrawals/:id/:action', requireRole(OWNERS), wrap(async (req, res) => {
  const { id, action } = req.params;
  if (!idOk(id) || !['paid', 'reject'].includes(action)) return back(res, '/admin/dashboard', 'error', 'Invalid request.');
  const tx = await Transaction.findOneAndUpdate({ _id: id, type: 'WITHDRAWAL', status: 'PENDING' }, { $set: { status: action === 'paid' ? 'COMPLETED' : 'FAILED' } });
  if (!tx) return back(res, '/admin/dashboard', 'error', 'Withdrawal already processed.');
  if (action === 'paid') {
    await Wallet.updateOne({ user: tx.user }, { $inc: { lockedBalancePaise: -tx.amountPaise } });
    await notify(tx.user, 'Withdrawal paid', `${paise(tx.amountPaise)} has been sent to your UPI.`, '/wallet');
  } else {
    await Wallet.updateOne({ user: tx.user }, { $inc: { lockedBalancePaise: -tx.amountPaise, winningBalancePaise: tx.amountPaise } });
    await notify(tx.user, 'Withdrawal rejected', `${paise(tx.amountPaise)} was returned to your winning balance.`, '/wallet');
  }
  await audit(req, `WITHDRAWAL_${action.toUpperCase()}`, String(tx._id), paise(tx.amountPaise));
  back(res, '/admin/dashboard', 'success', action === 'paid' ? 'Marked as paid.' : 'Withdrawal rejected and refunded to winnings.');
}));

// ============ HEALTH ============
router.get('/health', requireRole(STAFF), wrap(async (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  let pingMs = null;
  try { const t = Date.now(); await mongoose.connection.db.command({ ping: 1 }); pingMs = Date.now() - t; } catch { /* ignore */ }
  const mem = process.memoryUsage();
  res.render('admin/health', {
    title: 'System Health', active: 'health',
    info: {
      dbState, pingMs, node: process.version, uptime: Math.round(process.uptime()),
      rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576),
      platform: `${os.platform()} ${os.arch()}`, env: process.env.NODE_ENV || 'development',
      counts: {
        users: await User.countDocuments(), matches: await Match.countDocuments(),
        transactions: await Transaction.countDocuments(), disputes: await Dispute.countDocuments(),
      },
    },
  });
}));

// ============ MATCHES ============
router.get('/matches', requireRole(STAFF), wrap(async (req, res) => {
  const matches = await Match.find().sort({ matchStartAt: -1 }).limit(200);
  res.render('admin/matches', { title: 'Manage Matches', active: 'matches', matches });
}));

function readMatchForm(b) {
  const mode = modeBySlug(b.mode);
  const errors = [];
  if (!mode) errors.push('Choose a valid game mode.');

  const entry = rupeesToPaise(b.entry_fee);
  const prize = rupeesToPaise(b.prize_pool);
  if (isNaN(entry)) errors.push('Entry fee must be a number (₹).');
  if (isNaN(prize)) errors.push('Prize pool must be a number (₹).');

  const isTournament = mode?.isTournament || false;

  let maxPlayers = 0;
  let maxTeams = null;
  let totalMatches = null;
  let teamSize = mode?.teamSize || 1;

  if (isTournament) {
    maxTeams = parseInt(b.max_teams, 10);
    totalMatches = parseInt(b.total_matches, 10);
    teamSize = parseInt(b.team_size, 10) || 4;

    if (!(maxTeams >= 2 && maxTeams <= 24)) errors.push('Max teams must be between 2 and 24.');
    if (!(totalMatches >= 1 && totalMatches <= 20)) errors.push('Total matches must be between 1 and 20.');
    if (!(teamSize >= 2 && teamSize <= 6)) errors.push('Team size must be between 2 and 6.');

    maxPlayers = maxTeams * teamSize;
  } else {
    maxPlayers = parseInt(b.max_players, 10);
    if (!(maxPlayers >= 2 && maxPlayers <= 100)) errors.push('Max players must be between 2 and 100.');
  }

  const times = {
    registrationStartAt: fromInput(b.registration_start_at),
    registrationCloseAt: fromInput(b.registration_close_at),
    roomReleaseAt: fromInput(b.room_release_at),
    matchStartAt: fromInput(b.match_start_at),
  };
  Object.entries(times).forEach(([k, v]) => { if (!v) errors.push(`Invalid date/time for ${k}.`); });
  if (!errors.length) {
    if (times.registrationStartAt >= times.registrationCloseAt) errors.push('Registration must open before it closes.');
    if (times.registrationCloseAt > times.matchStartAt) errors.push('Registration must close before the match starts.');
    if (times.roomReleaseAt > times.matchStartAt) errors.push('Room release must be before match start.');
  }

  const map = MAPS.includes(b.map_name) ? b.map_name : 'Bermuda';

  // ✅ Custom tournament name use karo (agar diya hai)
  const tournamentName = isTournament ? String(b.tournament_name || '').trim() : '';
  const displayName = (isTournament && tournamentName) ? tournamentName.slice(0, 80) : mode?.name;

  const data = {
    mode: mode?.slug,
    modeName: displayName,        // ← Custom name yahan
    matchFormat: mode?.format,
    teamSize,
    mapName: map,
    maxPlayers,
    entryFeePaise: entry,
    prizePoolPaise: prize,
    ...times,
    rulesText: String(b.rules_text || '').slice(0, 2000),
  };

  const tournamentData = isTournament ? {
    isTournament: true,
    maxTeams,
    totalMatches,
    teamSize,
    name: displayName,            // ← Same custom name
    description: String(b.tournament_description || '').slice(0, 500),
    grandPrizePaise: prize,
  } : { isTournament: false };

  return {
    data, errors,
    roomId: String(b.room_id || '').trim(),
    roomPassword: String(b.room_password || '').trim(),
    tournamentData,
  };
}

const defaultForm = () => {
  const { toInput } = require('../utils/format');
  const now = Date.now();
  const m = (mins) => toInput(new Date(now + mins * 60000));
  return {
    mode: 'clash-squad-4v4', map_name: 'Bermuda',
    entry_fee: '50', prize_pool: '350', max_players: 8,
    registration_start_at: m(0), registration_close_at: m(25),
    room_release_at: m(20), match_start_at: m(30),
    room_id: '', room_password: '', rules_text: '',
    // Tournament defaults
    max_teams: 12, total_matches: 6, team_size: 4,
    tournament_name: '', tournament_description: '',
  };
};

router.get('/matches/create', requireRole(STAFF), (req, res) => {
  res.render('admin/match-form', {
    title: 'Create Match', active: 'create', edit: null,
    form: defaultForm(), errors: [], modes: MODES, maps: MAPS,
    isTournamentForm: false,
  });
});

router.post('/matches/create', requireRole(STAFF), wrap(async (req, res) => {
  const { data, errors, roomId, roomPassword, tournamentData } = readMatchForm(req.body);

  if (errors.length) {
    return res.status(400).render('admin/match-form', {
      title: 'Create Match', active: 'create', edit: null,
      form: req.body, errors, modes: MODES, maps: MAPS,
      isTournamentForm: !!tournamentData?.isTournament,
    });
  }

  const match = new Match({ ...data, createdBy: req.user._id });
  match.roomId = roomId;
  match.roomPassword = roomPassword;
  await match.save();

  // If BR Squad Tournament — create Tournament entry
  if (tournamentData?.isTournament) {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.create({
      name: tournamentData.name,
      description: tournamentData.description,
      mapName: data.mapName,
      format: 'BR_SQUAD',
      teamSize: tournamentData.teamSize,
      maxTeams: tournamentData.maxTeams,
      totalMatches: tournamentData.totalMatches,
      entryFeePaise: data.entryFeePaise,
      grandPrizePaise: tournamentData.grandPrizePaise,
      registrationStartAt: data.registrationStartAt,
      registrationCloseAt: data.registrationCloseAt,
      tournamentStartAt: data.matchStartAt,
      status: 'OPEN',
      host: req.user._id,
    });

    await audit(req, 'TOURNAMENT_CREATE', tournament.publicCode, tournament.name);
    return back(res, '/admin/matches', 'success', `Tournament ${tournament.publicCode} created.`);
  }

  await audit(req, 'MATCH_CREATE', match.publicMatchCode, match.modeName);
  back(res, '/admin/matches', 'success', `Match ${match.publicMatchCode} created.`);
}));

router.get('/matches/:id/edit', requireRole(STAFF), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const m = await Match.findById(req.params.id);
  if (!m) return next();
  const { toInput } = require('../utils/format');
  const form = {
    mode: m.mode, map_name: m.mapName, entry_fee: m.entryFeePaise / 100, prize_pool: m.prizePoolPaise / 100, max_players: m.maxPlayers,
    registration_start_at: toInput(m.registrationStartAt), registration_close_at: toInput(m.registrationCloseAt),
    room_release_at: toInput(m.roomReleaseAt), match_start_at: toInput(m.matchStartAt),
    room_id: m.roomId, room_password: m.roomPassword, rules_text: m.rulesText,
  };
  res.render('admin/match-form', {
    title: `Edit ${m.publicMatchCode}`, active: 'matches', edit: m, form, errors: [], modes: MODES, maps: MAPS,
    isTournamentForm: m.matchFormat === 'BR_SQUAD',
  });
}));

router.post('/matches/:id/edit', requireRole(STAFF), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const m = await Match.findById(req.params.id);
  if (!m) return next();
  const render = (errors) => res.status(400).render('admin/match-form', { title: `Edit ${m.publicMatchCode}`, active: 'matches', edit: m, form: req.body, errors, modes: MODES, maps: MAPS });

  if (m.status !== 'ACTIVE') return render(['Only active matches can be edited.']);
  const { data, errors, roomId, roomPassword } = readMatchForm(req.body);
  if (!errors.length && m.registrationCount > 0) {
    if (data.maxPlayers < m.registrationCount) errors.push(`Max players cannot be below current registrations (${m.registrationCount}).`);
    if (data.entryFeePaise !== m.entryFeePaise) errors.push('Entry fee cannot change after players have joined.');
  }
  if (errors.length) return render(errors);

  Object.assign(m, data);
  m.roomId = roomId;
  m.roomPassword = roomPassword;
  await m.save();
  await audit(req, 'MATCH_UPDATE', m.publicMatchCode);
  back(res, '/admin/matches', 'success', `Match ${m.publicMatchCode} updated.`);
}));

router.post('/matches/:id/cancel', requireRole(STAFF), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const m = await Match.findById(req.params.id);
  if (!m) return next();
  if (['COMPLETED', 'CANCELLED'].includes(m.status)) return back(res, '/admin/matches', 'error', 'This match is already finished.');
  await cancelMatch(m, String(req.body.reason || '').trim().slice(0, 200));
  await audit(req, 'MATCH_CANCEL', m.publicMatchCode, req.body.reason || '');
  back(res, '/admin/matches', 'success', `Match ${m.publicMatchCode} cancelled${m.entryFeePaise > 0 ? ' and entry fees refunded' : ''}.`);
}));

// ============ RESULTS ============
router.get('/results', requireRole(STAFF), wrap(async (req, res) => {
  const all = await Match.find({ status: { $in: ['ACTIVE', 'RESULT_SUBMITTED', 'COMPLETED'] } }).sort({ matchStartAt: -1 }).limit(100);
  const pending = all.filter((m) => m.status === 'RESULT_SUBMITTED' || (m.status === 'ACTIVE' && m.displayStatus() === 'IN_PROGRESS'));
  const completed = all.filter((m) => m.status === 'COMPLETED').slice(0, 10);

  let selected = null;
  let teams = null;

  if (req.query.match && idOk(req.query.match)) {
    selected = await Match.findById(req.query.match).populate('registrations.user', 'profile email');

    // ✅ BR Squad: build team-wise data
    if (selected && selected.matchFormat === 'BR_SQUAD') {
      const teamMap = {};
      selected.registrations.forEach((r) => {
        if (!r.teamSlot) return;
        if (!teamMap[r.teamSlot]) {
          teamMap[r.teamSlot] = {
            slot: r.teamSlot,
            teamName: r.teamName,
            teamId: r.teamId,
            igl: null,
            players: [],
          };
        }
        teamMap[r.teamSlot].players.push({
          user: r.user,
          isIGL: r.isIGL,
        });
        if (r.isIGL) {
          teamMap[r.teamSlot].igl = r.user;
        }
      });
      teams = Object.values(teamMap).sort((a, b) => a.slot - b.slot);
    }
  }

  res.render('admin/results', {
    title: 'Result Verification',
    active: 'results',
    pending,
    completed,
    selected,
    teams,
    canApprove: OWNERS.includes(req.user.role),
  });
}));

router.post('/results/:id/submit', requireRole(STAFF), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const m = await Match.findById(req.params.id).populate('registrations.user', 'profile email');
  if (!m) return next();
  const url = `/admin/results?match=${m._id}`;
  if (!['ACTIVE', 'RESULT_SUBMITTED'].includes(m.status)) return back(res, url, 'error', 'Results cannot be changed for this match.');
  if (m.status === 'ACTIVE' && m.displayStatus() !== 'IN_PROGRESS') return back(res, url, 'error', 'The match has not started yet.');
  if (!m.registrations.length) return back(res, url, 'error', 'No players registered in this match.');

  const toArr = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

  // ============================================================
  // BR SQUAD TOURNAMENT — team-wise results
  // ============================================================
  if (m.matchFormat === 'BR_SQUAD') {
    const teamSlots = toArr(req.body.team_slot);
    const placements = toArr(req.body.placement);
    const kills = toArr(req.body.kills);
    const amounts = toArr(req.body.amount);

    if (!teamSlots.length) return back(res, url, 'error', 'No teams submitted.');

    const totalAmount = amounts.reduce((s, a) => s + (parseInt(a, 10) || 0) * 100, 0);
    if (totalAmount > m.prizePoolPaise) {
      return back(res, url, 'error', `Total prize (${paise(totalAmount)}) exceeds grand prize pool (${paise(m.prizePoolPaise)}).`);
    }

    // Find IGL for each team slot
    const iglBySlot = {};
    m.registrations.forEach((r) => {
      if (r.isIGL && r.teamSlot) iglBySlot[r.teamSlot] = r.user;
    });

    const results = [];
    const teamPlacements = {};

    for (let i = 0; i < teamSlots.length; i++) {
      const slot = parseInt(teamSlots[i], 10);
      const p = parseInt(placements[i], 10);
      const k = parseInt(kills[i] || '0', 10);
      const amt = parseInt(amounts[i], 10) || 0;

      if (!slot || !(p >= 1) || !(k >= 0) || amt < 0) {
        return back(res, url, 'error', 'Every team needs a valid placement, kills, and amount.');
      }

      const igl = iglBySlot[slot];
      if (!igl) return back(res, url, 'error', `No IGL found for slot #${slot}.`);

      // Store result ONLY on IGL (prize goes to IGL)
      results.push({
        user: igl._id,
        placement: p,
        kills: k,
        prizePaise: amt * 100,
        teamSlot: slot,
        teamName: m.registrations.find((r) => r.teamSlot === slot)?.teamName || '',
      });

      teamPlacements[slot] = p;
    }

    // Store on match
    m.results = results;
    m.resultNotes = String(req.body.notes || '').slice(0, 500);
    m.teamPlacements = teamPlacements; // for display
    m.status = 'RESULT_SUBMITTED';
    await m.save();

    await audit(req, 'RESULT_SUBMIT', m.publicMatchCode, `${results.length} teams`);
    return back(res, url, 'success', 'Team results submitted for verification.');
  }

  // ============================================================
  // REGULAR MATCH — player-wise results (existing logic)
  // ============================================================
  const uids = toArr(req.body.user), places = toArr(req.body.placement), kills = toArr(req.body.kills);
  const valid = new Set(m.registrations.map((r) => String(r.user._id || r.user)));
  const results = [];
  for (let i = 0; i < uids.length; i++) {
    const p = parseInt(places[i], 10), k = parseInt(kills[i] || '0', 10);
    if (!valid.has(uids[i]) || !(p >= 1) || !(k >= 0)) return back(res, url, 'error', 'Every player needs a placement (1 or higher) and non-negative kills.');
    results.push({ user: uids[i], placement: p, kills: k, prizePaise: 0 });
  }
  if (results.length !== m.registrations.length) return back(res, url, 'error', 'Results must include every registered player.');
  if (!results.some((r) => r.placement === 1)) return back(res, url, 'error', 'At least one player must have placement 1 (winner).');

  m.results = results;
  m.resultNotes = String(req.body.notes || '').slice(0, 500);
  m.status = 'RESULT_SUBMITTED';
  await m.save();
  await audit(req, 'RESULT_SUBMIT', m.publicMatchCode);
  back(res, url, 'success', 'Result submitted for verification.');
}));
router.post('/results/:id/approve', requireRole(OWNERS), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  // Atomic status flip prevents double payouts on double-click.
  const m = await Match.findOneAndUpdate(
    { _id: req.params.id, status: 'RESULT_SUBMITTED' },
    { $set: { status: 'COMPLETED' } },
    { new: true }
  );
  if (!m) return back(res, '/admin/results', 'error', 'Nothing to approve (already settled or not submitted).');

  await settleMatch(m);
  await audit(req, 'RESULT_APPROVE', m.publicMatchCode, `Prize pool ${paise(m.prizePoolPaise)}`);
  back(res, '/admin/results', 'success', `Match ${m.publicMatchCode} settled. Prizes credited.`);
}));

router.post('/results/:id/reject', requireRole(OWNERS), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const m = await Match.findOneAndUpdate(
    { _id: req.params.id, status: 'RESULT_SUBMITTED' },
    { $set: { status: 'ACTIVE', rejectReason: String(req.body.reason || 'Rejected by admin').slice(0, 200) } },
    { new: true }
  );
  if (!m) return back(res, '/admin/results', 'error', 'Nothing to reject.');
  await audit(req, 'RESULT_REJECT', m.publicMatchCode, m.rejectReason);
  back(res, `/admin/results?match=${m._id}`, 'success', 'Result rejected. Please re-enter it.');
}));

// ============ UID VERIFICATION ============
router.get('/gaming-identities', requireRole(SUPPORTERS), wrap(async (req, res) => {
  const status = ['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'PENDING';
  const users = await User.find({ 'profile.freeFireUid': { $exists: true, $ne: '' }, uidStatus: status }).sort({ updatedAt: -1 }).limit(200);
  res.render('admin/gaming-identities', { title: 'UID Verification', active: 'identities', users, status });
}));

router.post('/gaming-identities/:id/verify', requireRole(SUPPORTERS), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const status = req.body.status === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';
  const u = await User.findById(req.params.id);
  if (!u) return next();
  u.uidStatus = status;
  u.uidNotes = String(req.body.notes || '').slice(0, 200);
  await u.save();
  await notify(u._id, status === 'VERIFIED' ? 'Free Fire UID verified' : 'Free Fire UID rejected',
    status === 'VERIFIED' ? 'Your UID is verified. Good luck!' : `Reason: ${u.uidNotes || 'not specified'}. Update your UID in your profile.`, '/profile');
  await audit(req, `UID_${status}`, u.email, u.profile.freeFireUid);
  back(res, `/admin/gaming-identities?status=${req.query.status || 'PENDING'}`, 'success', `UID ${status.toLowerCase()} for ${u.email}.`);
}));

// ============ DISPUTES ============
router.get('/disputes', requireRole(SUPPORTERS), wrap(async (req, res) => {
  const status = ['OPEN', 'RESOLVED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'OPEN';
  const disputes = await Dispute.find({ status }).sort({ createdAt: -1 }).limit(200)
    .populate('user', 'email profile').populate('match', 'publicMatchCode modeName');
  res.render('admin/disputes', { title: 'Disputes', active: 'disputes', disputes, status });
}));

router.post('/disputes/:id/resolve', requireRole(SUPPORTERS), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  const status = req.body.status === 'REJECTED' ? 'REJECTED' : 'RESOLVED';
  const resolution = String(req.body.resolution || '').trim().slice(0, 500);
  if (resolution.length < 3) return back(res, '/admin/disputes', 'error', 'Please write a resolution note.');
  const d = await Dispute.findOneAndUpdate({ _id: req.params.id, status: 'OPEN' }, { $set: { status, resolution, resolvedBy: req.user._id } }, { new: true });
  if (!d) return back(res, '/admin/disputes', 'error', 'Dispute already handled.');
  await notify(d.user, `Dispute ${status.toLowerCase()}`, resolution, '/disputes');
  await audit(req, `DISPUTE_${status}`, String(d._id), resolution);
  back(res, '/admin/disputes', 'success', 'Dispute updated.');
}));

// ============ USERS ============
router.get('/users', requireRole(OWNERS), wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = {};
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { 'profile.displayName': rx }, { 'profile.freeFireUid': rx }, { 'profile.freeFireName': rx }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(100);
  res.render('admin/users', { title: 'User Accounts', active: 'users', users, q, roles: ROLES, statuses: USER_STATUSES, isSuper: req.user.role === 'SUPER_ADMIN' });
}));

router.post('/users/:id/status', requireRole(OWNERS), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  if (!USER_STATUSES.includes(req.body.status)) return back(res, '/admin/users', 'error', 'Invalid status.');
  if (String(req.params.id) === String(req.user._id)) return back(res, '/admin/users', 'error', 'You cannot change your own status.');
  const u = await User.findById(req.params.id);
  if (!u) return next();
  if (u.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') return back(res, '/admin/users', 'error', 'Only a super admin can modify a super admin.');
  u.status = req.body.status;
  await u.save();
  await audit(req, 'USER_STATUS', u.email, req.body.status);
  back(res, '/admin/users', 'success', `${u.email} is now ${u.status}.`);
}));

router.post('/users/:id/role', requireRole(['SUPER_ADMIN']), wrap(async (req, res, next) => {
  if (!idOk(req.params.id)) return next();
  if (!ROLES.includes(req.body.role)) return back(res, '/admin/users', 'error', 'Invalid role.');
  if (String(req.params.id) === String(req.user._id)) return back(res, '/admin/users', 'error', 'You cannot change your own role.');
  const u = await User.findByIdAndUpdate(req.params.id, { $set: { role: req.body.role } }, { new: true });
  if (!u) return next();
  await audit(req, 'USER_ROLE', u.email, req.body.role);
  back(res, '/admin/users', 'success', `${u.email} is now ${u.role}.`);
}));

// ============ AUDIT + RISK ============
router.get('/audit-logs', requireRole(OWNERS), wrap(async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
  res.render('admin/audit-logs', { title: 'Audit Logs', active: 'audit', logs });
}));

router.get('/risk-flags', requireRole(OWNERS), wrap(async (req, res) => {
  const flags = [];
  const bad = await User.find({ $or: [{ status: { $ne: 'ACTIVE' } }, { uidStatus: 'REJECTED' }] }).limit(100);
  bad.forEach((u) => {
    if (u.status !== 'ACTIVE') flags.push({ level: 'HIGH', type: 'ACCOUNT_RESTRICTED', user: u, detail: `Account is ${u.status}` });
    if (u.uidStatus === 'REJECTED') flags.push({ level: 'MEDIUM', type: 'UID_REJECTED', user: u, detail: u.uidNotes || 'Free Fire UID was rejected' });
  });
  const bigW = await Transaction.find({ type: 'WITHDRAWAL', status: 'PENDING', amountPaise: { $gte: 500000 } }).populate('user', 'email profile');
  bigW.forEach((t) => flags.push({ level: 'HIGH', type: 'LARGE_WITHDRAWAL', user: t.user, detail: `Pending withdrawal ${paise(t.amountPaise)}` }));
  const disp = await Dispute.aggregate([{ $group: { _id: '$user', n: { $sum: 1 } } }, { $match: { n: { $gte: 3 } } }]);
  for (const d of disp) {
    const u = await User.findById(d._id);
    if (u) flags.push({ level: 'MEDIUM', type: 'FREQUENT_DISPUTES', user: u, detail: `${d.n} disputes filed` });
  }
  res.render('admin/risk-flags', { title: 'Risk Telemetry', active: 'risk', flags });
}));
router.post(
  '/matches/:id/point-table',
  requireRole(STAFF),
  uploadPointTable.single('image'),
  wrap(async (req, res) => {
    if (!idOk(req.params.id)) {
      res.flash('error', 'Invalid match.');
      return res.redirect('/admin/matches');
    }

    const m = await Match.findById(req.params.id);
    if (!m) {
      res.flash('error', 'Match not found.');
      return res.redirect('/admin/matches');
    }

    if (m.matchFormat !== 'BR_SQUAD') {
      res.flash('error', 'Point tables are only for BR Squad tournaments.');
      return res.redirect(`/admin/matches/${m._id}/edit`);
    }

    const matchNumber = parseInt(req.body.match_number, 10);
    const type = req.body.image_type;

    if (!(matchNumber >= 1 && matchNumber <= 20)) {
      res.flash('error', 'Invalid match number.');
      return res.redirect(`/admin/matches/${m._id}/edit`);
    }

    if (!['FF_SCREENSHOT', 'POINT_TABLE'].includes(type)) {
      res.flash('error', 'Invalid image type.');
      return res.redirect(`/admin/matches/${m._id}/edit`);
    }

    if (!req.file) {
      res.flash('error', 'Please select an image to upload.');
      return res.redirect(`/admin/matches/${m._id}/edit`);
    }

    // Check if image already exists for this slot
    const existing = m.pointTables.find(
      (p) => p.matchNumber === matchNumber && p.type === type
    );

    if (existing) {
      // Delete old image from Cloudinary
      await deleteImage(existing.publicId);
      // Remove old entry
      m.pointTables = m.pointTables.filter(
        (p) => !(p.matchNumber === matchNumber && p.type === type)
      );
    }

    // Add new entry
    m.pointTables.push({
      matchNumber,
      type,
      url: req.file.path,
      publicId: req.file.filename,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    });

    await m.save();
    await audit(req, 'POINT_TABLE_UPLOAD', m.publicMatchCode, `Match ${matchNumber} - ${type}`);

    res.flash('success', `Match ${matchNumber} ${type === 'FF_SCREENSHOT' ? 'screenshot' : 'point table'} uploaded.`);
    res.redirect(`/admin/matches/${m._id}/edit`);
  })
);

router.post('/matches/:id/point-table/:matchNum/:type/delete', requireRole(STAFF), wrap(async (req, res) => {
  if (!idOk(req.params.id)) {
    res.flash('error', 'Invalid match.');
    return res.redirect('/admin/matches');
  }

  const m = await Match.findById(req.params.id);
  if (!m) {
    res.flash('error', 'Match not found.');
    return res.redirect('/admin/matches');
  }

  const matchNumber = parseInt(req.params.matchNum, 10);
  const type = req.params.type;

  const entry = m.pointTables.find(
    (p) => p.matchNumber === matchNumber && p.type === type
  );

  if (!entry) {
    res.flash('error', 'Image not found.');
    return res.redirect(`/admin/matches/${m._id}/edit`);
  }

  await deleteImage(entry.publicId);
  m.pointTables = m.pointTables.filter(
    (p) => !(p.matchNumber === matchNumber && p.type === type)
  );
  await m.save();

  await audit(req, 'POINT_TABLE_DELETE', m.publicMatchCode, `Match ${matchNumber} - ${type}`);
  res.flash('success', 'Image deleted.');
  res.redirect(`/admin/matches/${m._id}/edit`);
}));
// ============================================================
// SYSTEM CONTROLS — SUPER ADMIN ONLY
// ============================================================
router.get('/system', requireRole(['SUPER_ADMIN']), wrap(async (req, res) => {
  const settings = await SystemSettings.getSettings();
  res.render('admin/system', {
    title: 'System Controls',
    active: 'system',
    settings,
  });
}));

router.post('/system/wallet/toggle', requireRole(['SUPER_ADMIN']), wrap(async (req, res) => {
  const settings = await SystemSettings.getSettings();
  
  if (settings.walletFrozen) {
    // Unfreeze
    settings.walletFrozen = false;
    settings.walletFrozenReason = '';
    settings.walletFrozenAt = null;
    settings.walletFrozenBy = null;
    await settings.save();
    await audit(req, 'WALLET_UNFREEZE', 'system', 'Wallet unfrozen');
    res.flash('success', 'Wallet system UNFROZEN. All transactions resumed.');
  } else {
    // Freeze
    settings.walletFrozen = true;
    settings.walletFrozenReason = String(req.body.reason || 'Emergency freeze by admin').slice(0, 200);
    settings.walletFrozenAt = new Date();
    settings.walletFrozenBy = req.user._id;
    await settings.save();
    await audit(req, 'WALLET_FREEZE', 'system', settings.walletFrozenReason);
    res.flash('error', 'Wallet system FROZEN. All transactions blocked.');
  }
  
  res.redirect('/admin/system');
}));
module.exports = router;
