const express = require('express');
const mongoose = require('mongoose');
const ChatGroup = require('../models/ChatGroup');
const ChatMessage = require('../models/ChatMessage');
const ChatMember = require('../models/ChatMember');
const wrap = require('../utils/wrap');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadChatImage, deleteImage } = require('../services/cloudinary');
const { notify } = require('../services/notify');

const router = express.Router();
const HOST = ['MATCH_HOST', 'ADMIN', 'SUPER_ADMIN'];

// ============================================================
// HOST — GROUPS LIST
// ============================================================
router.get('/host/chats', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  const groups = await ChatGroup.find({ host: req.user._id, status: 'ACTIVE' })
    .sort({ lastMessageAt: -1, createdAt: -1 });

  res.render('host/chats', {
    title: 'My Chat Groups',
    groups,
    active: 'chats',
  });
}));

// ============================================================
// HOST — CREATE FORM
// ============================================================
router.get('/host/chats/create', requireAuth, requireRole(HOST), (req, res) => {
  res.render('host/chat-create', {
    title: 'Create Chat Group',
    error: null,
    form: {},
    active: 'chats',
  });
});

// ============================================================
// HOST — CREATE POST
// ============================================================
router.post('/host/chats/create', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();

  const fail = (msg) => res.status(400).render('host/chat-create', {
    title: 'Create Chat Group',
    error: msg,
    form: { name, description },
    active: 'chats',
  });

  if (name.length < 3 || name.length > 60) return fail('Group name must be 3-60 characters.');
  if (description.length > 200) return fail('Description must be under 200 characters.');

  let inviteCode;
  let attempts = 0;
  do {
    inviteCode = ChatGroup.generateInviteCode();
    attempts++;
    if (attempts > 5) return fail('Could not generate code. Try again.');
  } while (await ChatGroup.exists({ inviteCode }));

  const group = await ChatGroup.create({
    name,
    description,
    host: req.user._id,
    inviteCode,
  });

  res.flash('success', `Group "${name}" created.`);
  res.redirect(`/host/chats/${group._id}`);
}));

// ============================================================
// HOST — VIEW + SEND
// ============================================================
router.get('/host/chats/:id', requireAuth, requireRole(HOST), wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();

  const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id, status: 'ACTIVE' });
  if (!group) {
    res.flash('error', 'Group not found.');
    return res.redirect('/host/chats');
  }

  const messages = await ChatMessage.find({ group: group._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('sender', 'profile email');

  messages.reverse();

  const members = await ChatMember.find({ group: group._id, status: 'ACTIVE' })
    .populate('user', 'profile email')
    .sort({ joinedAt: -1 });

  const inviteUrl = `${req.protocol}://${req.get('host')}/chat/join/${group.inviteCode}`;

  res.render('host/chat-view', {
    title: group.name,
    group,
    messages,
    members,
    inviteUrl,
    active: 'chats',
  });
}));

// ============================================================
// HOST — SEND MESSAGE
// ============================================================
router.post('/host/chats/:id/send', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.flash('error', 'Invalid group.');
    return res.redirect('/host/chats');
  }

  const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id, status: 'ACTIVE' });
  if (!group) {
    res.flash('error', 'Group not found.');
    return res.redirect('/host/chats');
  }

  const text = String(req.body.message || '').trim();
  if (!text) {
    res.flash('error', 'Message cannot be empty.');
    return res.redirect(`/host/chats/${group._id}`);
  }

  await ChatMessage.create({
    group: group._id,
    sender: req.user._id,
    message: text.slice(0, 2000),
  });

  group.messageCount += 1;
  group.lastMessageAt = new Date();
  await group.save();

  // Notify all members
  const members = await ChatMember.find({ group: group._id, status: 'ACTIVE' });
  for (const m of members) {
    await notify(m.user, `New message in "${group.name}"`, text.slice(0, 80), `/chat/${group._id}`);
  }

  res.redirect(`/host/chats/${group._id}`);
}));

// ============================================================
// HOST — UPLOAD IMAGE
// ============================================================
router.post(
  '/host/chats/:id/image',
  requireAuth,
  requireRole(HOST),
  uploadChatImage.single('image'),
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.flash('error', 'Invalid group.');
      return res.redirect('/host/chats');
    }

    const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id, status: 'ACTIVE' });
    if (!group) {
      res.flash('error', 'Group not found.');
      return res.redirect('/host/chats');
    }

    if (!req.file) {
      res.flash('error', 'Please select an image.');
      return res.redirect(`/host/chats/${group._id}`);
    }

    await ChatMessage.create({
      group: group._id,
      sender: req.user._id,
      message: '',
      imageUrl: req.file.path,
      imagePublicId: req.file.filename,
    });

    group.messageCount += 1;
    group.lastMessageAt = new Date();
    await group.save();

    const members = await ChatMember.find({ group: group._id, status: 'ACTIVE' });
    for (const m of members) {
      await notify(m.user, `New image in "${group.name}"`, '📷 Photo shared', `/chat/${group._id}`);
    }

    res.redirect(`/host/chats/${group._id}`);
  })
);

// ============================================================
// HOST — DELETE MESSAGE
// ============================================================
router.post('/host/chats/:id/message/:msgId/delete', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.msgId)) {
    res.flash('error', 'Invalid.');
    return res.redirect('/host/chats');
  }

  const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id });
  if (!group) {
    res.flash('error', 'Group not found.');
    return res.redirect('/host/chats');
  }

  const msg = await ChatMessage.findOne({ _id: req.params.msgId, group: group._id });
  if (!msg) {
    res.flash('error', 'Message not found.');
    return res.redirect(`/host/chats/${group._id}`);
  }

  if (msg.imagePublicId) await deleteImage(msg.imagePublicId);

  msg.deleted = true;
  msg.message = '';
  msg.imageUrl = '';
  msg.imagePublicId = '';
  await msg.save();

  res.flash('success', 'Message deleted.');
  res.redirect(`/host/chats/${group._id}`);
}));

// ============================================================
// HOST — REGENERATE INVITE
// ============================================================
router.post('/host/chats/:id/regenerate', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id });
  if (!group) {
    res.flash('error', 'Group not found.');
    return res.redirect('/host/chats');
  }

  let code;
  let attempts = 0;
  do {
    code = ChatGroup.generateInviteCode();
    attempts++;
    if (attempts > 5) break;
  } while (await ChatGroup.exists({ inviteCode: code }));

  group.inviteCode = code;
  await group.save();

  res.flash('success', 'New invite link generated.');
  res.redirect(`/host/chats/${group._id}`);
}));

// ============================================================
// HOST — DELETE GROUP
// ============================================================
router.post('/host/chats/:id/delete', requireAuth, requireRole(HOST), wrap(async (req, res) => {
  const group = await ChatGroup.findOne({ _id: req.params.id, host: req.user._id });
  if (!group) {
    res.flash('error', 'Group not found.');
    return res.redirect('/host/chats');
  }

  // Delete all images
  const messages = await ChatMessage.find({ group: group._id, imagePublicId: { $ne: '' } });
  for (const m of messages) {
    if (m.imagePublicId) await deleteImage(m.imagePublicId);
  }

  await ChatMessage.deleteMany({ group: group._id });
  await ChatMember.deleteMany({ group: group._id });
  group.status = 'ARCHIVED';
  await group.save();

  res.flash('success', 'Group deleted.');
  res.redirect('/host/chats');
}));

// ============================================================
// USER — JOIN VIA INVITE LINK
// ============================================================
router.get('/chat/join/:code', requireAuth, wrap(async (req, res) => {
  const group = await ChatGroup.findOne({ inviteCode: req.params.code, status: 'ACTIVE' })
    .populate('host', 'profile email');

  if (!group) {
    return res.status(404).render('error', { code: 404, message: 'Invalid invite link.' });
  }

  const existing = await ChatMember.findOne({ group: group._id, user: req.user._id, status: 'ACTIVE' });
  if (existing) return res.redirect(`/chat/${group._id}`);

  const memberCount = await ChatMember.countDocuments({ group: group._id, status: 'ACTIVE' });

  res.render('chat/join', {
    title: `Join ${group.name}`,
    group,
    memberCount,
  });
}));

router.post('/chat/join/:code', requireAuth, wrap(async (req, res) => {
  const group = await ChatGroup.findOne({ inviteCode: req.params.code, status: 'ACTIVE' });
  if (!group) {
    res.flash('error', 'Invalid invite link.');
    return res.redirect('/dashboard');
  }

  const existing = await ChatMember.findOne({ group: group._id, user: req.user._id });
  if (existing && existing.status === 'ACTIVE') {
    return res.redirect(`/chat/${group._id}`);
  }

  if (existing) {
    existing.status = 'ACTIVE';
    existing.joinedAt = new Date();
    await existing.save();
  } else {
    await ChatMember.create({ group: group._id, user: req.user._id });
  }

  group.memberCount = await ChatMember.countDocuments({ group: group._id, status: 'ACTIVE' });
  await group.save();

  res.flash('success', `Joined "${group.name}"!`);
  res.redirect(`/chat/${group._id}`);
}));

// ============================================================
// USER — VIEW CHAT (read-only)
// ============================================================
router.get('/chat/:id', requireAuth, wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();

  const group = await ChatGroup.findOne({ _id: req.params.id, status: 'ACTIVE' })
    .populate('host', 'profile email');

  if (!group) return next();

  const membership = await ChatMember.findOne({ group: group._id, user: req.user._id, status: 'ACTIVE' });
  if (!membership && String(group.host._id) !== String(req.user._id)) {
    res.flash('error', 'You are not a member of this group.');
    return res.redirect('/dashboard');
  }

  // Update last read
  if (membership) {
    membership.lastReadAt = new Date();
    await membership.save();
  }

  const messages = await ChatMessage.find({ group: group._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('sender', 'profile email');

  messages.reverse();

  res.render('chat/view', {
    title: group.name,
    group,
    messages,
    isHost: String(group.host._id) === String(req.user._id),
  });
}));

// ============================================================
// USER — MY CHATS LIST
// ============================================================
router.get('/chat', requireAuth, wrap(async (req, res) => {
  const memberships = await ChatMember.find({ user: req.user._id, status: 'ACTIVE' })
    .populate({
      path: 'group',
      match: { status: 'ACTIVE' },
      populate: { path: 'host', select: 'profile email' },
    })
    .sort({ updatedAt: -1 });

  const groups = memberships.filter((m) => m.group).map((m) => m.group);

  res.render('chat/list', {
    title: 'My Chats',
    groups,
  });
}));

module.exports = router;