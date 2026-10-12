const mongoose = require('mongoose');
const { Schema } = mongoose;

const teamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    tag: {
      type: String,
      trim: true,
      maxlength: 6,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    logo: {
      type: String,
      default: '',
    },
    igl: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    memberCount: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DISBANDED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

teamSchema.methods.regenerateInviteCode = function () {
  this.inviteCode = generateInviteCode();
  return this.inviteCode;
};

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

teamSchema.statics.generateInviteCode = generateInviteCode;

module.exports = mongoose.model('Team', teamSchema);