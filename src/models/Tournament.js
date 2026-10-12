const mongoose = require('mongoose');
const { Schema } = mongoose;

const tournamentSchema = new Schema(
  {
    publicCode: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    mapName: { type: String, default: 'Bermuda' },

    // Format
    format: { type: String, default: 'BR_SQUAD' }, // Battle Royale Squad
    teamSize: { type: Number, default: 4 }, // IGL + 3
    maxTeams: { type: Number, default: 12 },
    totalMatches: { type: Number, default: 6 },

    // Money
    entryFeePaise: { type: Number, default: 0, min: 0 },
    grandPrizePaise: { type: Number, default: 0, min: 0 },

    // Schedule
    registrationStartAt: Date,
    registrationCloseAt: Date,
    tournamentStartAt: Date,

    // Status
    status: {
      type: String,
      enum: ['DRAFT', 'OPEN', 'LIVE', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    cancelReason: String,

    // Host (admin / match host)
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Counters
    registeredTeams: { type: Number, default: 0 },

    // Final prize distribution (set by host after 6 matches)
    prizeDistribution: [
      {
        _id: false,
        position: Number, // 1, 2, 3
        tournamentTeam: { type: Schema.Types.ObjectId, ref: 'TournamentTeam' },
        igl: { type: Schema.Types.ObjectId, ref: 'User' },
        percentage: Number,
        amountPaise: Number,
        paidAt: Date,
      },
    ],
    prizesPaid: { type: Boolean, default: false },
    finalizedAt: Date,
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

tournamentSchema.index({ status: 1, tournamentStartAt: 1 });
tournamentSchema.index({ host: 1, createdAt: -1 });

tournamentSchema.pre('validate', function (next) {
  if (!this.publicCode) {
    this.publicCode = 'TRN-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  next();
});

tournamentSchema.methods.isFull = function () {
  return this.registeredTeams >= this.maxTeams;
};

tournamentSchema.methods.displayStatus = function (now = new Date()) {
  if (this.status !== 'OPEN') return this.status;
  const t = now.getTime();
  if (this.registrationCloseAt && t >= this.registrationCloseAt.getTime()) return 'REGISTRATION_CLOSED';
  if (this.isFull()) return 'FULL';
  if (this.registrationStartAt && t < this.registrationStartAt.getTime()) return 'SCHEDULED';
  return 'OPEN';
};

tournamentSchema.methods.canJoin = function (now = new Date()) {
  return this.displayStatus(now) === 'OPEN';
};

module.exports = mongoose.model('Tournament', tournamentSchema);