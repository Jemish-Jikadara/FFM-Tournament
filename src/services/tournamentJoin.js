const Match = require('../models/Match');
const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');
const walletSvc = require('./wallet');

class TournamentJoinError extends Error {}

/**
 * IGL joins a BR Squad tournament with selected players
 */
async function joinTournament(iglUser, matchId, { teamName, selectedUserIds }) {
  // 1. Only IGL can join
  if (!iglUser.isIGL()) {
    throw new TournamentJoinError('Only IGL accounts can join BR Squad tournaments.');
  }

  // 2. Load match
  const match = await Match.findById(matchId);
  if (!match) throw new TournamentJoinError('Match not found.');

  if (match.matchFormat !== 'BR_SQUAD') {
    throw new TournamentJoinError('This is not a BR Squad tournament.');
  }

  // 3. Check registration open
  if (!match.canJoin()) {
    throw new TournamentJoinError('Registration is not open for this tournament.');
  }

  // 4. Check team exists
  const team = await Team.findOne({ igl: iglUser._id, status: 'ACTIVE' });
  if (!team) {
    throw new TournamentJoinError('You need to create a team first.');
  }

  // 5. Already registered?
  if (match.teamRegistered(team._id)) {
    throw new TournamentJoinError('Your team is already registered for this tournament.');
  }

  // 6. Check full (team-wise)
  if (match.currentTeams() >= match.maxTeams()) {
    throw new TournamentJoinError('Tournament is full.');
  }

  // 7. Validate teamName
  const cleanName = String(teamName || '').trim();
  if (cleanName.length < 3 || cleanName.length > 40) {
    throw new TournamentJoinError('Team name must be 3-40 characters.');
  }

  // 8. Validate selected players (must be 4, including IGL)
  const ids = Array.isArray(selectedUserIds) ? selectedUserIds : [selectedUserIds].filter(Boolean);
  const teamSize = match.teamSize || 4;

  if (ids.length !== teamSize) {
    throw new TournamentJoinError(`You must select exactly ${teamSize} players (including yourself).`);
  }

  const iglId = String(iglUser._id);
  if (!ids.map(String).includes(iglId)) {
    throw new TournamentJoinError('You (IGL) must be included in the selected players.');
  }

  // 9. Validate all selected are active members of the team
  const activeMembers = await TeamMember.find({ team: team._id, status: 'ACTIVE' });
  const activeUserIds = activeMembers.map((m) => String(m.user));

  for (const id of ids) {
    if (!activeUserIds.includes(String(id))) {
      throw new TournamentJoinError('One or more selected players are not in your roster.');
    }
  }

  // 10. Check wallet balance (IGL pays)
  const wallet = await walletSvc.ensureWallet(iglUser._id);
  if (wallet.totalSpendable() < match.entryFeePaise) {
    throw new TournamentJoinError('Insufficient balance. Please add cash to your wallet.');
  }

  // 11. Deduct entry fee from IGL
  if (match.entryFeePaise > 0) {
    const ok = await walletSvc.debitSpend(iglUser._id, match.entryFeePaise, {
      type: 'ENTRY_FEE',
      description: `Entry fee for ${match.modeName}`,
      referenceType: 'MATCH',
      referenceId: match._id,
      idempotencyKey: `BR-ENTRY:${match._id}:${team._id}`,
    });
    if (!ok) throw new TournamentJoinError('Could not deduct entry fee. Try again.');
  }

  // 12. Assign team slot
  const slot = match.currentTeams() + 1;

  // 13. Add registrations for all 4 players
  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    match.registrations.push({
      user: userId,
      joinedAt: new Date(),
      teamId: team._id,
      teamName: cleanName,
      teamSlot: slot,
      isIGL: String(userId) === iglId,
    });
  }

  match.registrationCount = match.registrations.length;
  await match.save();

  return { match, slot, teamName: cleanName };
}

module.exports = { joinTournament, TournamentJoinError };