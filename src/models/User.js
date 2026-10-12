const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['PLAYER', 'IGL','MATCH_HOST', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'], default: 'PLAYER' },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'BANNED'], default: 'ACTIVE' },
    profile: {
      displayName: { type: String, trim: true },
      freeFireUid: { type: String, trim: true },
      freeFireName: { type: String, trim: true },
      totalMatches: { type: Number, default: 0 },
      totalWins: { type: Number, default: 0 },
      totalLosses: { type: Number, default: 0 },
      totalWinningsPaise: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
    },
    uidStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    uidNotes: { type: String, default: '' },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ 'profile.freeFireUid': 1 });

userSchema.methods.isAdmin = function () {
  return ['ADMIN', 'SUPER_ADMIN', 'MATCH_HOST'].includes(this.role);
};

userSchema.methods.isStaff = function () {
  return ['ADMIN', 'SUPER_ADMIN', 'MATCH_HOST', 'SUPPORT'].includes(this.role);
};
userSchema.methods.isIGL = function () {
  return this.role === 'IGL'; 
}
userSchema.methods.isPlayer = function() {
  return this.role === 'PLAYER';
}
userSchema.methods.shownName = function () {
  return this.profile?.displayName || this.email.split('@')[0];
};

module.exports = mongoose.model('User', userSchema);
