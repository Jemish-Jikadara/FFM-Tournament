// Small public JSON API (read-only) - handy for health checks and integrations.
const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const wrap = require('../utils/wrap');

const router = express.Router();
const ok = (res, data) => res.json({ success: true, data });

const shape = (m) => ({
  id: m._id, code: m.publicMatchCode, mode: m.mode, modeName: m.modeName, format: m.matchFormat, map: m.mapName,
  status: m.displayStatus(), entryFeePaise: m.entryFeePaise, prizePoolPaise: m.prizePoolPaise,
  players: m.currentPlayers(), maxPlayers: m.maxPlayers, matchStartAt: m.matchStartAt, roomReleaseAt: m.roomReleaseAt,
});

router.get('/health', (req, res) => ok(res, { status: 'healthy', db: mongoose.connection.readyState === 1 ? 'connected' : 'down', time: new Date().toISOString() }));

router.get('/matches', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const matches = await Match.find().sort({ matchStartAt: 1 }).limit(limit);
  ok(res, matches.map(shape));
}));

router.get('/matches/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
  const m = await Match.findById(req.params.id);
  if (!m) return res.status(404).json({ success: false, message: 'Not found' });
  ok(res, shape(m));
}));

module.exports = router;
