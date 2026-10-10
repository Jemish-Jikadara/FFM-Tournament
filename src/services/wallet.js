const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

async function ensureWallet(userId) {
  let w = await Wallet.findOne({ user: userId });
  if (!w) {
    try { w = await Wallet.create({ user: userId }); }
    catch { w = await Wallet.findOne({ user: userId }); }
  }
  return w;
}

async function record(userId, data, wallet) {
  const balanceAfter = wallet ? wallet.availableBalancePaise + wallet.winningBalancePaise : 0;
  try {
    return await Transaction.create({ user: userId, balanceAfterPaise: balanceAfter, ...data });
  } catch (e) {
    if (e.code === 11000) return null; // idempotency key already used -> already recorded
    throw e;
  }
}

/** Credit money. bucket: 'available' | 'winning' */
async function credit(userId, amountPaise, { bucket = 'available', type, description, referenceType, referenceId, idempotencyKey } = {}) {
  if (!(amountPaise > 0)) throw new Error('Invalid amount');
  await ensureWallet(userId);
  if (idempotencyKey && (await Transaction.exists({ idempotencyKey }))) return null;
  const field = bucket === 'winning' ? 'winningBalancePaise' : 'availableBalancePaise';
  const wallet = await Wallet.findOneAndUpdate({ user: userId }, { $inc: { [field]: amountPaise } }, { new: true });
  await record(userId, {
    type, direction: 'CREDIT', amountPaise, description, referenceType, referenceId: String(referenceId || ''), idempotencyKey,
  }, wallet);
  return wallet;
}

/**
 * Debit for spending (entry fees). Uses available balance first, then winnings.
 * Returns the updated wallet, or null if the balance is insufficient.
 */
async function debitSpend(userId, amountPaise, { type = 'ENTRY_FEE', description, referenceType, referenceId, idempotencyKey } = {}) {
  if (amountPaise === 0) return await ensureWallet(userId);
  const current = await ensureWallet(userId);
  if (current.totalSpendable() < amountPaise) return null;
  const fromAvail = Math.min(current.availableBalancePaise, amountPaise);
  const fromWin = amountPaise - fromAvail;
  // Conditional update: fails (null) if a concurrent request drained the balance.
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

/** Withdrawal request: moves money from winnings to "locked" until an admin pays it out. */
async function requestWithdrawal(userId, amountPaise, upi) {
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
