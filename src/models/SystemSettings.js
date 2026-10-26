const mongoose = require('mongoose');
const { Schema } = mongoose;

const systemSettingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    
    // ✅ Wallet freeze
    walletFrozen: { type: Boolean, default: false },
    walletFrozenReason: { type: String, default: '' },
    walletFrozenAt: { type: Date, default: null },
    walletFrozenBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    
    // ✅ Optional: match freeze
    matchesFrozen: { type: Boolean, default: false },
    
    // ✅ Optional: chat freeze
    chatFrozen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

systemSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);