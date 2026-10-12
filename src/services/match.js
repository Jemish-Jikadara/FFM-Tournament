const Match = require('../models/Match');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const walletSvc = require('./wallet');
const { notify } = require('./notify');
const { paise } = require('../utils/format');

class JoinError extends Error {}

async function joinMatch(user, matchId) {
  const match = await Match.findById(matchId);
  if (!match) throw new JoinError('Match not found.');
  if (user.status !== 'ACTIVE') throw new JoinError('Your account is not allowed to join matches.');
  if (!user.profile?.freeFireUid) throw new JoinError('Add your Free Fire UID in your profile before joining.');
  if (user.uidStatus === 'REJECTED') throw new JoinError('Your Free Fire UID was rejected. Update it in your profile.');
  if (match.isRegistered(user._id)) throw new JoinError('You are already registered for this match.');
  const state = match.displayStatus();
  if (state === 'FULL') throw new JoinError('This match is fully booked.');
  if (state !== 'REGISTRATION_OPEN') throw new JoinError('Registration is not open for this match.');

  const fee = match.entryFeePaise;
  const key = `ENTRY:${match._id}:${user._id}`;

  // 1) take the money (skipped for free matches)
  if (fee > 0) {
    const w = await walletSvc.debitSpend(user._id, fee, {
      type: 'ENTRY_FEE', description: `Entry fee - ${match.modeName} (${match.publicMatchCode})`,
      referenceType: 'MATCH', referenceId: match._id, idempotencyKey: key,
    });
    if (!w) throw new JoinError(`Insufficient wallet balance. Entry fee is ${paise(fee)}. Add cash and try again.`);
  }

  // 2) take the slot atomically (fails if full / already joined / cancelled meanwhile)
  const updated = await Match.findOneAndUpdate(
    {
      _id: match._id,
      status: 'ACTIVE',
      registrationCount: { $lt: match.maxPlayers },
      'registrations.user': { $ne: user._id },
    },
    { $inc: { registrationCount: 1 }, $push: { registrations: { user: user._id, joinedAt: new Date() } } },
    { new: true }
  );

  if (!updated) {
    // 3) slot lost -> refund
    if (fee > 0) {
      await walletSvc.credit(user._id, fee, {
        bucket: 'available', type: 'REFUND', description: `Refund - could not join ${match.publicMatchCode}`,
        referenceType: 'MATCH', referenceId: match._id, idempotencyKey: `REFUND:${key}:${Date.now()}`,
      });
    }
    throw new JoinError('Could not secure a slot (match just filled up). Any fee was refunded.');
  }

  await notify(user._id, 'Slot confirmed', `You joined ${updated.modeName} (${updated.publicMatchCode}). Room details unlock at release time.`, `/matches/${updated._id}`);
  return updated;
}

/** Refund everyone and mark the match cancelled. */
async function cancelMatch(match, reason) {
  match.status = 'CANCELLED';
  match.cancelReason = reason || 'Cancelled by admin';
  await match.save();
  for (const r of match.registrations) {
    if (match.entryFeePaise > 0) {
      await walletSvc.credit(r.user, match.entryFeePaise, {
        bucket: 'available', type: 'REFUND', description: `Refund - ${match.publicMatchCode} cancelled`,
        referenceType: 'MATCH', referenceId: match._id, idempotencyKey: `CANCEL_REFUND:${match._id}:${r.user}`,
      });
    }
    await notify(r.user, 'Match cancelled', `${match.publicMatchCode} was cancelled. ${match.entryFeePaise > 0 ? 'Your entry fee was refunded.' : ''}`, `/matches/${match._id}`);
  }
}

/** Pay winners and update player stats. Caller must already have flipped the match to COMPLETED (atomic guard). */
/** Pay winners and update player stats. Caller must already have flipped the match to COMPLETED (atomic guard). */
async function settleMatch(match) {
  // ============================================================
  // BR SQUAD TOURNAMENT — prize goes to IGL only
  // ============================================================
  if (match.matchFormat === 'BR_SQUAD') {
    for (const r of match.results) {
      const prize = r.prizePaise || 0;
      const u = await User.findById(r.user);
      if (!u) continue;

      // IGL stats: 1 match played. If placement 1 → win
      u.profile.totalMatches += 1;
      if (r.placement === 1) {
        u.profile.totalWins += 1;
        u.profile.currentStreak += 1;
      } else {
        u.profile.totalLosses += 1;
        u.profile.currentStreak = 0;
      }
      if (prize > 0) {
        u.profile.totalWinningsPaise += prize;
      }
      await u.save();

      // Credit prize to IGL winning balance
      if (prize > 0) {
        await walletSvc.credit(r.user, prize, {
          bucket: 'winning',
          type: 'PRIZE',
          description: `Tournament Prize - ${match.modeName} (${match.publicMatchCode})`,
          referenceType: 'MATCH',
          referenceId: match._id,
          idempotencyKey: `PRIZE:${match._id}:${r.user}`,
        });
        await notify(r.user, 'You won a prize!',
          `${paise(prize)} was credited to your winning balance.`,
          '/wallet');
      } else {
        await notify(r.user, 'Result published',
          `Results for ${match.publicMatchCode} are final.`,
          `/matches/${match._id}`);
      }
    }

    match.markModified('results');
    await match.save();
    return;
  }

  // ============================================================
  // REGULAR MATCH — existing logic
  // ============================================================
  const winners = match.results.filter((r) => r.placement === 1);
  const share = winners.length ? Math.floor(match.prizePoolPaise / winners.length) : 0;

  for (const r of match.results) {
    const won = r.placement === 1;
    const prize = won ? share : 0;
    r.prizePaise = prize;
    const u = await User.findById(r.user);
    if (!u) continue;
    u.profile.totalMatches += 1;
    if (won) { u.profile.totalWins += 1; u.profile.currentStreak += 1; u.profile.totalWinningsPaise += prize; }
    else { u.profile.totalLosses += 1; u.profile.currentStreak = 0; }
    await u.save();
    if (prize > 0) {
      await walletSvc.credit(r.user, prize, {
        bucket: 'winning', type: 'PRIZE', description: `Prize - ${match.modeName} (${match.publicMatchCode})`,
        referenceType: 'MATCH', referenceId: match._id, idempotencyKey: `PRIZE:${match._id}:${r.user}`,
      });
      await notify(r.user, 'You won a prize!', `${paise(prize)} was credited to your winning balance.`, '/wallet');
    } else {
      await notify(r.user, 'Result published', `Results for ${match.publicMatchCode} are final.`, `/matches/${match._id}`);
    }
  }
  match.markModified('results');
  await match.save();
}

module.exports = { joinMatch, cancelMatch, settleMatch, JoinError };
