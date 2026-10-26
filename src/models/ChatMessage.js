const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatMessageSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'ChatGroup', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '', maxlength: 2000 },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatMessageSchema.index({ group: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);