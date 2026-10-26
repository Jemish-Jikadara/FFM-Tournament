const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inviteCode: { type: String, required: true, unique: true, index: true },
    memberCount: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: null },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

chatGroupSchema.statics.generateInviteCode = generateCode;

chatGroupSchema.methods.regenerateInviteCode = function () {
  this.inviteCode = generateCode();
  return this.inviteCode;
};

module.exports = mongoose.model('ChatGroup', chatGroupSchema);