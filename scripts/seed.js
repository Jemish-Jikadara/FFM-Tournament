// Usage: npm run seed   (safe to run many times)
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { connectDB } = require('../src/config/db');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Match = require('../src/models/Match');
const walletSvc = require('../src/services/wallet');
const { modeBySlug } = require('../src/config/game');

async function upsertUser({ email, password, role, displayName, uid, ign, verified = true, cash = 0 }) {
  let u = await User.findOne({ email });
  if (!u) {
    u = await User.create({
      email, role, passwordHash: await bcrypt.hash(password, 12), uidStatus: verified ? 'VERIFIED' : 'PENDING',
      profile: { displayName, freeFireUid: uid, freeFireName: ign },
    });
    console.log('  + created', role, email);
  } else {
    console.log('  = exists ', role, email);
  }
  await walletSvc.ensureWallet(u._id);
  if (cash > 0 && (await require('../src/models/Wallet').findOne({ user: u._id })).availableBalancePaise === 0) {
    await walletSvc.credit(u._id, cash, { bucket: 'available', type: 'BONUS', description: 'Seed starter cash', idempotencyKey: `SEED:${email}` });
  }
  return u;
}

(async () => {
  await connectDB();
  console.log('Seeding...');
  const admin = await upsertUser({ email: env.seedAdminEmail, password: env.seedAdminPassword, role: 'SUPER_ADMIN', displayName: 'Admin', uid: '100000001', ign: 'ClashIQ_Admin' });
  await upsertUser({ email: 'player@clashiq.gg', password: 'Player@123', role: 'PLAYER', displayName: 'Viper_99', uid: '194820194', ign: 'Viper99', cash: 50000 });

  if ((await Match.countDocuments()) === 0) {
    const min = (n) => new Date(Date.now() + n * 60000);
    const samples = [
      { mode: 'clash-squad-4v4', map: 'Bermuda', fee: 50, prize: 350, start: 180, room: 165, close: 150, roomId: '58201947', pw: 'CIQ4V4' },
      { mode: 'clash-squad-2v2', map: 'Kalahari', fee: 30, prize: 200, start: 240, room: 225, close: 210, roomId: '77120385', pw: 'CIQ2V2' },
      { mode: 'lone-wolf-1v1', map: 'Iron Cage', fee: 20, prize: 35, start: 300, room: 285, close: 270, roomId: '33019284', pw: 'LONE1' },
      { mode: 'solo', map: 'Purgatory', fee: 30, prize: 1000, start: 1440, room: 1425, close: 1400, roomId: '90218374', pw: 'SOLO48' },
      { mode: 'clash-squad-1v1', map: 'Alpine', fee: 0, prize: 0, start: 60, room: 45, close: 40, roomId: '12345678', pw: 'FREE1V1' },
    ];
    for (const s of samples) {
      const mode = modeBySlug(s.mode);
      const m = new Match({
        mode: mode.slug, modeName: mode.name, matchFormat: mode.format, teamSize: mode.teamSize, mapName: s.map,
        maxPlayers: mode.maxPlayers, entryFeePaise: s.fee * 100, prizePoolPaise: s.prize * 100,
        registrationStartAt: min(-5), registrationCloseAt: min(s.close), roomReleaseAt: min(s.room), matchStartAt: min(s.start),
        createdBy: admin._id,
      });
      m.roomId = s.roomId; m.roomPassword = s.pw;
      await m.save();
    }
    console.log(`  + created ${samples.length} sample matches`);
  } else {
    console.log('  = matches already exist, skipping samples');
  }

  console.log('\nDone.\n  Admin : ' + env.seedAdminEmail + ' / ' + env.seedAdminPassword + '\n  Player: player@clashiq.gg / Player@123\n');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
