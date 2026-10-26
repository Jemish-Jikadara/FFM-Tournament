const SystemSettings = require('../models/SystemSettings');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

async function ensureWallet(userId) {
  let w = await Wallet.findOne({ user: userId });
  if (!w) {
    try {
      w = await Wallet.create({ user: userId });
    } catch {
      w = await Wallet.findOne({ user: userId });
    }
  }
  return w;
}

async function record(userId, data, wallet) {
  const balanceAfter = wallet ? wallet.availableBalancePaise + wallet.winningBalancePaise : 0;
  try {
    return await Transaction.create({ user: userId, balanceAfterPaise: balanceAfter, ...data });
  } catch (e) {
    if (e.code === 11000) return null;
    throw e;
  }
}

async function credit(userId, amountPaise, { bucket = 'available', type, description, referenceType, referenceId, idempotencyKey } = {}) {
  if (!(amountPaise > 0)) throw new Error('Invalid amount');

  // ✅ FREEZE CHECK
  const settings = await SystemSettings.getSettings();
  if (settings.walletFrozen) {
    throw new Error('Wallet system is temporarily frozen. Cannot credit.');
  }

  await ensureWallet(userId);
  if (idempotencyKey && (await Transaction.exists({ idempotencyKey }))) return null;
  const field = bucket === 'winning' ? 'winningBalancePaise' : 'availableBalancePaise';
  const wallet = await Wallet.findOneAndUpdate({ user: userId }, { $inc: { [field]: amountPaise } }, { new: true });
  await record(userId, {
    type, direction: 'CREDIT', amountPaise, description, referenceType, referenceId: String(referenceId || ''), idempotencyKey,
  }, wallet);
  return wallet;
}

async function debitSpend(userId, amountPaise, { type = 'ENTRY_FEE', description, referenceType, referenceId, idempotencyKey } = {}) {
  if (amountPaise === 0) return await ensureWallet(userId);

  // ✅ FREEZE CHECK
  const settings = await SystemSettings.getSettings();
  if (settings.walletFrozen) return null;

  const current = await ensureWallet(userId);
  if (current.totalSpendable() < amountPaise) return null;
  const fromAvail = Math.min(current.availableBalancePaise, amountPaise);
  const fromWin = amountPaise - fromAvail;
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, availableBalancePaise: { $gte: fromAvail }, winningBalancePaise: { $gte: fromWin } },
    { $inc: { availableBalancePaise: -fromAvail, winningBalancePaise: -fromWin } },
    { new: true }
  );
  if (!wallet) return null;
  await record(userId, {
    type, direction: 'DEBIT', amountPaise, description, referenceType, referenceId: String(referenceId || ''), idempotencyKey,
  }, wallet);
  return wallet;
}

async function requestWithdrawal(userId, amountPaise, upi) {
  // ✅ FREEZE CHECK
  const settings = await SystemSettings.getSettings();
  if (settings.walletFrozen) return null;

  await ensureWallet(userId);
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, winningBalancePaise: { $gte: amountPaise } },
    { $inc: { winningBalancePaise: -amountPaise, lockedBalancePaise: amountPaise } },
    { new: true }
  );
  if (!wallet) return null;
  await record(userId, {
    type: 'WITHDRAWAL', direction: 'DEBIT', amountPaise, status: 'PENDING',
    description: `Withdrawal request to UPI ${upi}`, referenceType: 'WITHDRAWAL',
  }, wallet);
  return wallet;
}

module.exports = { ensureWallet, credit, debitSpend, requestWithdrawal };