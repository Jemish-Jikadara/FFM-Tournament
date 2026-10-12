const mongoose = require('mongoose');
const { Schema } = mongoose;

const selectedPlayerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    slot: { type: Number, required: true }, // 1-4
  },
  { _id: false }
);

const tournamentTeamSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    igl: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Team display name for this tournament
    teamName: { type: String, required: true, trim: true, maxlength: 40 },
    teamTag: { type: String, trim: true, maxlength: 6, uppercase: true },

    // Selected 4 players (IGL + 3 from roster)
    selectedPlayers: [selectedPlayerSchema],

    // Assigned slot (1 to maxTeams)
    slot: { type: Number, required: true },

    // Money
    entryPaidPaise: { type: Number, required: true, min: 0 },

    // Points (accumulated across matches)
    totalPoints: { type: Number, default: 0 },
    totalKills: { type: Number, default: 0 },

    // Per-match results (populated by host after each match)
    matchResults: [
      {
        _id: false,
        matchNumber: Number, // 1-6
        placement: Number, // 1-12
        kills: Number,
        points: Number, // placement + kill points
      },
    ],

    // Final payout
    finalPosition: Number, // 1, 2, 3 (null if not in top 3)
    finalPrizePaise: { type: Number, default: 0 },
    prizePaidAt: Date,

    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

tournamentTeamSchema.index({ tournament: 1, slot: 1 }, { unique: true });
tournamentTeamSchema.index({ tournament: 1, igl: 1 }, { unique: true });
tournamentTeamSchema.index({ tournament: 1, teamName: 1 }, { unique: true });

module.exports = mongoose.model('TournamentTeam', tournamentTeamSchema);