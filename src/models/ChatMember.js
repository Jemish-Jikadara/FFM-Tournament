const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatMemberSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'ChatGroup', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'LEFT', 'KICKED'], default: 'ACTIVE' },
    lastReadAt: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatMemberSchema.index({ group: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('ChatMember', chatMemberSchema);