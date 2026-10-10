const mongoose = require('mongoose');
const { Schema } = mongoose;

const disputeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    match: { type: Schema.Types.ObjectId, ref: 'Match' },
    type: { type: String, enum: ['RESULT', 'TEAM_ASSIGNMENT', 'PAYMENT', 'CHEATING', 'OTHER'], default: 'RESULT' },
    description: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: ['OPEN', 'RESOLVED', 'REJECTED'], default: 'OPEN' },
    resolution: { type: String, default: '' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);
