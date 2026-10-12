const express = require('express');
const mongoose = require('mongoose');
const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const wrap = require('../utils/wrap');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../services/notify');

const router = express.Router();
router.use('/team', requireAuth);

// ============================================================
// HELPER — ensure user is IGL
// ============================================================
function requireIGL(req, res, next) {
  if (!req.user.isIGL()) {
    res.flash('error', 'Only IGL accounts can access team management.');
    return res.redirect('/dashboard');
  }
  next();
}

// ============================================================
// TEAM CREATE — GET
// ============================================================
router.get('/team/create', requireIGL, wrap(async (req, res) => {
  const existing = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (existing) return res.redirect('/team/manage');

  res.render('team/create', {
    title: 'Create Team',
    error: null,
    form: {},
  });
}));

// ============================================================
// TEAM CREATE — POST
// ============================================================
router.post('/team/create', requireIGL, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const tag = String(req.body.tag || '').trim().toUpperCase();
  const description = String(req.body.description || '').trim();

  const fail = (msg) => res.status(400).render('team/create', {
    title: 'Create Team',
    error: msg,
    form: { name, tag, description },
  });

  if (name.length < 3 || name.length > 30) return fail('Team name must be 3-30 characters.');
  if (tag && (tag.length < 2 || tag.length > 6)) return fail('Team tag must be 2-6 characters.');
  if (description.length > 200) return fail('Description must be under 200 characters.');

  // Check if user already has an active team
  const existing = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (existing) return fail('You already have an active team.');

  // Check unique name
  if (await Team.exists({ name, status: 'ACTIVE' })) {
    return fail('This team name is already taken.');
  }

  // Generate unique invite code
  let inviteCode;
  let attempts = 0;
  do {
    inviteCode = Team.generateInviteCode();
    attempts++;
    if (attempts > 5) return fail('Could not generate invite code. Please try again.');
  } while (await Team.exists({ inviteCode }));

  const team = await Team.create({
    name,
    tag: tag || undefined,
    description,
    igl: req.user._id,
    inviteCode,
    memberCount: 1,
  });

  // Add IGL as first member
  await TeamMember.create({
    team: team._id,
    user: req.user._id,
    role: 'IGL',
    status: 'ACTIVE',
  });

  res.flash('success', `Team "${name}" created successfully!`);
  res.redirect('/team/manage');
}));

// ============================================================
// TEAM MANAGE — Dashboard
// ============================================================
router.get('/team/manage', requireIGL, wrap(async (req, res) => {
  const team = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (!team) return res.redirect('/team/create');

  const members = await TeamMember.find({ team: team._id, status: 'ACTIVE' })
    .populate('user', 'email profile uidStatus role')
    .sort({ role: 1, joinedAt: 1 });

  const inviteUrl = `${req.protocol}://${req.get('host')}/team/join/${team.inviteCode}`;

  res.render('team/manage', {
    title: 'Manage Team',
    team,
    members,
    inviteUrl,
  });
}));

// ============================================================
// REGENERATE INVITE CODE
// ============================================================
router.post('/team/invite/regenerate', requireIGL, wrap(async (req, res) => {
  const team = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (!team) {
    res.flash('error', 'No active team found.');
    return res.redirect('/team/create');
  }

  let inviteCode;
  let attempts = 0;
  do {
    inviteCode = Team.generateInviteCode();
    attempts++;
    if (attempts > 5) {
      res.flash('error', 'Could not regenerate. Try again.');
      return res.redirect('/team/manage');
    }
  } while (await Team.exists({ inviteCode }));

  team.inviteCode = inviteCode;
  await team.save();

  res.flash('success', 'New invite link generated.');
  res.redirect('/team/manage');
}));

// ============================================================
// KICK MEMBER
// ============================================================
router.post('/team/member/:id/kick', requireIGL, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.flash('error', 'Invalid member.');
    return res.redirect('/team/manage');
  }

  const team = await Team.findOne({ igl: req.user._id, status: 'ACTIVE' });
  if (!team) {
    res.flash('error', 'No active team.');
    return res.redirect('/team/create');
  }

  const member = await TeamMember.findOne({
    _id: req.params.id,
    team: team._id,
    status: 'ACTIVE',
  });

  if (!member) {
    res.flash('error', 'Member not found.');
    return res.redirect('/team/manage');
  }

  if (String(member.user) === String(req.user._id)) {
    res.flash('error', 'You cannot kick yourself.');
    return res.redirect('/team/manage');
  }

  member.status = 'KICKED';
  await member.save();

  team.memberCount = Math.max(0, team.memberCount - 1);
  await team.save();

  await notify(member.user, 'Removed from team', `You were removed from team "${team.name}".`, '/dashboard');

  res.flash('success', 'Member removed.');
  res.redirect('/team/manage');
}));

// ============================================================
// JOIN VIA INVITE LINK — GET
// ============================================================
router.get('/team/join/:code', wrap(async (req, res) => {
  const team = await Team.findOne({ inviteCode: req.params.code, status: 'ACTIVE' })
    .populate('igl', 'profile email');

  if (!team) {
    return res.status(404).render('error', {
      code: 404,
      message: 'Invalid or expired invite link.',
    });
  }

  // Already a member?
  const existing = await TeamMember.findOne({
    team: team._id,
    user: req.user._id,
    status: 'ACTIVE',
  });

  if (existing) {
    res.flash('info', 'You are already a member of this team.');
    return res.redirect('/dashboard');
  }

  // IGL cannot join another team
  if (req.user.isIGL()) {
    res.flash('error', 'IGL accounts cannot join another team. Only players can.');
    return res.redirect('/dashboard');
  }

  const memberCount = await TeamMember.countDocuments({ team: team._id, status: 'ACTIVE' });

  res.render('team/join', {
    title: `Join ${team.name}`,
    team,
    memberCount,
  });
}));

// ============================================================
// JOIN VIA INVITE LINK — POST
// ============================================================
router.post('/team/join/:code', wrap(async (req, res) => {
  const team = await Team.findOne({ inviteCode: req.params.code, status: 'ACTIVE' });

  if (!team) {
    res.flash('error', 'Invalid invite link.');
    return res.redirect('/dashboard');
  }

  if (req.user.isIGL()) {
    res.flash('error', 'IGL accounts cannot join another team.');
    return res.redirect('/dashboard');
  }

  const existing = await TeamMember.findOne({
    team: team._id,
    user: req.user._id,
    status: 'ACTIVE',
  });

  if (existing) {
    res.flash('info', 'You are already a member of this team.');
    return res.redirect('/dashboard');
  }

  // Check if user is already in another active team
  const otherTeam = await TeamMember.findOne({
    user: req.user._id,
    status: 'ACTIVE',
  });

  if (otherTeam && String(otherTeam.team) !== String(team._id)) {
    res.flash('error', 'You are already part of another team. Leave it first.');
    return res.redirect('/dashboard');
  }

  // Reactivate or create member
  const kickedMember = await TeamMember.findOne({ team: team._id, user: req.user._id });
  if (kickedMember) {
    kickedMember.status = 'ACTIVE';
    kickedMember.joinedAt = new Date();
    await kickedMember.save();
  } else {
    await TeamMember.create({
      team: team._id,
      user: req.user._id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
  }

  team.memberCount = await TeamMember.countDocuments({ team: team._id, status: 'ACTIVE' });
  await team.save();

  await notify(team.igl, 'New team member', `${req.user.shownName()} joined team "${team.name}".`, '/team/manage');

  res.flash('success', `You joined team "${team.name}"!`);
  res.redirect('/dashboard');
}));

// ============================================================
// LEAVE TEAM (Player only)
// ============================================================
router.post('/team/leave', wrap(async (req, res) => {
  if (req.user.isIGL()) {
    res.flash('error', 'IGLs cannot leave their own team. Disband instead.');
    return res.redirect('/dashboard');
  }

  const membership = await TeamMember.findOne({
    user: req.user._id,
    status: 'ACTIVE',
  });

  if (!membership) {
    res.flash('error', 'You are not part of any team.');
    return res.redirect('/dashboard');
  }

  const team = await Team.findById(membership.team);

  membership.status = 'LEFT';
  await membership.save();

  if (team) {
    team.memberCount = await TeamMember.countDocuments({ team: team._id, status: 'ACTIVE' });
    await team.save();

    await notify(team.igl, 'Member left', `${req.user.shownName()} left team "${team.name}".`, '/team/manage');
  }

  res.flash('success', 'You left the team.');
  res.redirect('/dashboard');
}));

module.exports = router;