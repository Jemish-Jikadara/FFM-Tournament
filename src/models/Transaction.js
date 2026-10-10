const mongoose = require('mongoose');
const { Schema } = mongoose;

// Append-only ledger row.
const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['DEPOSIT', 'ENTRY_FEE', 'PRIZE', 'REFUND', 'WITHDRAWAL', 'BONUS', 'ADJUSTMENT'],
      required: true,
    },
    direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amountPaise: { type: Number, required: true, min: 0 },
    balanceAfterPaise: { type: Number, default: 0 },
    status: { type: String, enum: ['COMPLETED', 'PENDING', 'FAILED'], default: 'COMPLETED' },
    description: { type: String, default: '' },
    referenceType: { type: String, default: 'SYSTEM' },
    referenceId: { type: String, default: '' },
    // Prevents double charging / double payouts for the same event
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
