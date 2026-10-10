const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    availableBalancePaise: { type: Number, default: 0, min: 0 }, // deposits, refunds
    winningBalancePaise: { type: Number, default: 0, min: 0 }, // prize money (withdrawable)
    lockedBalancePaise: { type: Number, default: 0, min: 0 }, // pending withdrawals
  },
  { timestamps: true }
);

walletSchema.methods.totalSpendable = function () {
  return this.availableBalancePaise + this.winningBalancePaise;
};

module.exports = mongoose.model('Wallet', walletSchema);
