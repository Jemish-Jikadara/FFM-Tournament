const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encrypt, decrypt } = require('../utils/crypto');

const registrationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    // ✅ Tournament (BR Squad) fields
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamName: { type: String, default: '' },
    teamSlot: { type: Number, default: null },
    isIGL: { type: Boolean, default: false },
  },
  { _id: false }
);

const resultSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    placement: { type: Number, default: 0 },
    kills: { type: Number, default: 0 },
    prizePaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const matchSchema = new Schema(
  {
    publicMatchCode: { type: String, unique: true, index: true },
    mode: { type: String, required: true },
    modeName: { type: String, required: true },
    matchFormat: { type: String, required: true },
    teamSize: { type: Number, default: 1 },
    mapName: { type: String, default: 'Bermuda' },
    maxPlayers: { type: Number, required: true, min: 1 },
    entryFeePaise: { type: Number, default: 0, min: 0 },
    prizePoolPaise: { type: Number, default: 0, min: 0 },
    registrationStartAt: Date,
    registrationCloseAt: Date,
    roomReleaseAt: { type: Date, required: true },
    matchStartAt: { type: Date, required: true },
    roomIdEnc: { type: String, default: '' },
    roomPasswordEnc: { type: String, default: '' },
    rulesText: { type: String, default: '' },

    // ACTIVE = time-driven state; the others are set explicitly by admins
    status: { type: String, enum: ['ACTIVE', 'RESULT_SUBMITTED', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    cancelReason: String,
    resultNotes: String,
    rejectReason: String,

    registrationCount: { type: Number, default: 0 },
    registrations: [registrationSchema],
    results: [resultSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

matchSchema.index({ matchStartAt: 1 });
matchSchema.index({ 'registrations.user': 1 });

matchSchema.pre('validate', function (next) {
  if (!this.publicMatchCode) {
    this.publicMatchCode = 'FFM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  next();
});

// ---- room credentials (encrypted at rest) ----
matchSchema.virtual('roomId')
  .get(function () { return decrypt(this.roomIdEnc); })
  .set(function (v) { this.roomIdEnc = encrypt(v); });
matchSchema.virtual('roomPassword')
  .get(function () { return decrypt(this.roomPasswordEnc); })
  .set(function (v) { this.roomPasswordEnc = encrypt(v); });

// ---- computed helpers ----
matchSchema.methods.currentPlayers = function () {
  // registrationCount is kept in sync atomically on every join; fall back to the array if it is loaded.
  return this.registrationCount || (this.registrations ? this.registrations.length : 0) || 0;
};

matchSchema.methods.isFull = function () {
  return this.currentPlayers() >= this.maxPlayers;
};

// Status shown to users; derived from the clock so no cron job is needed.
matchSchema.methods.displayStatus = function (now = new Date()) {
  if (this.status !== 'ACTIVE') return this.status;
  const t = now.getTime();
  if (t >= this.matchStartAt.getTime()) return 'IN_PROGRESS';
  if (t >= this.roomReleaseAt.getTime()) return 'ROOM_READY';
  if (this.isFull()) return 'FULL';
  if (this.registrationCloseAt && t >= this.registrationCloseAt.getTime()) return 'REGISTRATION_CLOSED';
  if (this.registrationStartAt && t < this.registrationStartAt.getTime()) return 'SCHEDULED';
  return 'REGISTRATION_OPEN';
};

matchSchema.methods.canJoin = function (now = new Date()) {
  return this.displayStatus(now) === 'REGISTRATION_OPEN';
};

matchSchema.methods.isRoomReleased = function (now = new Date()) {
  return this.status === 'ACTIVE' && now.getTime() >= this.roomReleaseAt.getTime();
};

matchSchema.methods.isRegistered = function (userId) {
  if (!userId || !this.registrations) return false;
  const id = String(userId);
  return this.registrations.some((r) => String(r.user?._id || r.user) === id);
};

matchSchema.methods.slotOf = function (userId) {
  const id = String(userId);
  return this.registrations.findIndex((r) => String(r.user?._id || r.user) === id) + 1;
};
// ✅ Teams count for BR Squad tournaments
matchSchema.methods.currentTeams = function () {
  if (this.matchFormat !== 'BR_SQUAD') return this.currentPlayers();
  if (!this.registrations || !this.registrations.length) return 0;
  const teams = new Set();
  this.registrations.forEach((r) => {
    if (r.teamSlot) teams.add(r.teamSlot);
  });
  return teams.size;
};

// ✅ Max teams (for BR Squad)
matchSchema.methods.maxTeams = function () {
  if (this.matchFormat !== 'BR_SQUAD') return this.maxPlayers;
  return Math.ceil(this.maxPlayers / (this.teamSize || 4));
};

// ✅ Is user's team registered?
matchSchema.methods.teamRegistered = function (teamId) {
  if (!teamId || !this.registrations) return false;
  return this.registrations.some((r) => String(r.teamId) === String(teamId));
};

// ✅ Get slot of a team
matchSchema.methods.slotOfTeam = function (teamId) {
  const reg = this.registrations.find((r) => String(r.teamId) === String(teamId));
  return reg ? reg.teamSlot : null;
};
module.exports = mongoose.model('Match', matchSchema);
