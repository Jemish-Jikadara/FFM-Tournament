const mongoose = require('mongoose');
const { Schema } = mongoose;

const teamMemberSchema = new Schema(
  {
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['IGL', 'MEMBER'],
      default: 'MEMBER',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'KICKED', 'LEFT'],
      default: 'ACTIVE',
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent same user joining same team twice
teamMemberSchema.index({ team: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('TeamMember', teamMemberSchema);