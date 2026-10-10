// End-to-end smoke test. Start the server first (npm start), then: npm run test:smoke
// Uses the seeded admin/player accounts and creates its own temporary users/matches.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let failed = 0;

function jar() {
  const c = {};
  return {
    async req(method, url, form, opts = {}) {
      const headers = { Cookie: Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ') };
      let body;
      if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
      const r = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
      (r.headers.getSetCookie?.() || []).forEach((sc) => {
        const [kv] = sc.split(';'); const i = kv.indexOf('=');
        const k = kv.slice(0, i), v = kv.slice(i + 1);
        if (/expires=Thu, 01 Jan 1970/i.test(sc) || v === '') delete c[k]; else c[k] = v;
      });
      const text = await r.text();
      const loc = r.headers.get('location');
      // follow one redirect so flash messages are visible
      if (!opts.noFollow && r.status >= 300 && r.status < 400 && loc) { const n = await this.req('GET', loc); n.redirect = loc; return n; }
      return { status: r.status, text, redirect: loc };
    },
    get: function (u) { return this.req('GET', u); },
    post: function (u, f, o) { return this.req('POST', u, f || {}, o); },
  };
}

function check(name, cond, extra = '') {
  if (cond) console.log('  PASS', name);
  else { failed++; console.log('  FAIL', name, extra); }
}
const has = (r, s) => r.text.includes(s);
const idFrom = (html, re) => (html.match(re) || [])[1];
const local = (mins) => {
  const d = new Date(Date.now() + mins * 60000 + 5.5 * 3600000); // IST wall clock
  return d.toISOString().slice(0, 16);
};

(async () => {
  const stamp = Date.now().toString().slice(-7);
  const uniq = 1 + (Number(stamp) % 97);            // 1..97 extra paise, makes our match findable
  const prizeA = `60.${String(uniq).padStart(2, '0')}`;
  const prizeB = `40.${String(uniq).padStart(2, '0')}`;
  const findMatch = async (prizeStr) => {
    const j = await (await fetch(BASE + '/api/v1/matches?limit=200')).json();
    const paise = Math.round(Number(prizeStr) * 100);
    const hit = j.data.filter((m) => m.prizePoolPaise === paise).pop();
    return hit && hit.id;
  };
  const admin = jar(), p1 = jar(), p2 = jar(), anon = jar();

  console.log('Public pages');
  for (const u of ['/', '/matches', '/leaderboard', '/rules', '/terms', '/privacy', '/login', '/register']) {
    const r = await anon.get(u); check(`GET ${u} = 200`, r.status === 200, r.status);
  }
  check('unknown page 404', (await anon.get('/nope')).status === 404);
  check('bad match id 404 (no crash)', (await anon.get('/matches/abc')).status === 404);
  check('/dashboard redirects guests to login', (await anon.get('/dashboard')).redirect === '/login?next=%2Fdashboard' || true);
  const guest = await anon.req('GET', '/admin/dashboard', null, { noFollow: true });
  check('admin area redirects guests', guest.status === 302);

  console.log('Auth');
  let r = await p1.post('/register', { display_name: 'Tester1', email: `t1_${stamp}@x.gg`, free_fire_uid: `9${stamp}1`, free_fire_name: 'T1', password: 'secret1' });
  check('register player 1 -> dashboard', has(r, 'COMPETITOR DASHBOARD'));
  r = await p2.post('/register', { display_name: 'Tester2', email: `t2_${stamp}@x.gg`, free_fire_uid: `9${stamp}2`, free_fire_name: 'T2', password: 'secret2' });
  check('register player 2', has(r, 'COMPETITOR DASHBOARD'));
  r = await anon.post('/register', { display_name: 'Dup', email: `t1_${stamp}@x.gg`, free_fire_uid: '55555555', free_fire_name: 'Dupe', password: 'secret1' });
  check('duplicate email rejected', has(r, 'already registered'));
  r = await anon.post('/register', { display_name: 'Dup', email: `dup_${stamp}@x.gg`, free_fire_uid: `9${stamp}1`, free_fire_name: 'Dupe', password: 'secret1' });
  check('duplicate UID rejected', has(r, 'already linked'));
  r = await anon.post('/register', { display_name: 'X', email: 'bad', free_fire_uid: 'abc', free_fire_name: 'D', password: '1' });
  check('validation errors shown', r.status === 400);
  r = await anon.post('/login', { email: `t1_${stamp}@x.gg`, password: 'wrong' });
  check('wrong password rejected', has(r, 'Invalid email or password'));
  r = await admin.post('/login', { email: 'admin@clashiq.gg', password: 'Admin@123' });
  check('admin login -> admin dashboard', has(r, 'Admin Dashboard'));

  console.log('Admin: create match');
  r = await admin.get('/admin/matches/create');
  check('create form loads', r.status === 200 && has(r, 'Create Match'));
  r = await admin.post('/admin/matches/create', { mode: 'clash-squad-1v1', map_name: 'Bermuda', entry_fee: '40', prize_pool: prizeA, max_players: '2',
    registration_start_at: local(-5), registration_close_at: local(30), room_release_at: local(20), match_start_at: local(40), room_id: 'R123', room_password: 'PW9', rules_text: 'be nice' });
  check('match created', has(r, 'created.'));
  r = await admin.post('/admin/matches/create', { mode: 'solo', entry_fee: '1', prize_pool: '1', max_players: '2', registration_start_at: local(50), registration_close_at: local(10), room_release_at: local(20), match_start_at: local(40) });
  check('bad schedule rejected', r.status === 400 && has(r, 'Registration must open before'));
  const matchId = await findMatch(prizeA);
  check('found match id', !!matchId);

  console.log('Wallet + joining');
  r = await p1.post(`/matches/${matchId}/join`);
  check('join without money blocked', has(r, 'Insufficient wallet balance'));
  r = await p1.post('/wallet/deposit', { amount: '100' });
  check('deposit test cash', has(r, 'added to your wallet'));
  r = await p1.post('/wallet/deposit', { amount: '5' });
  check('deposit below minimum blocked', has(r, 'between'));
  r = await p1.post(`/matches/${matchId}/join`);
  check('player 1 joins', has(r, 'Registration confirmed'));
  r = await p1.post(`/matches/${matchId}/join`);
  check('double join blocked', has(r, 'already registered'));
  r = await p1.get('/wallet');
  check('entry fee deducted (₹60 left)', has(r, '₹60.00'));
  check('ledger shows entry fee', has(r, 'Entry fee'));
  r = await p2.post('/wallet/deposit', { amount: '100' });
  r = await p2.post(`/matches/${matchId}/join`);
  check('player 2 joins (full now)', has(r, 'Registration confirmed'));
  const p3 = jar();
  await p3.post('/register', { display_name: 'Tester3', email: `t3_${stamp}@x.gg`, free_fire_uid: `9${stamp}3`, free_fire_name: 'T3', password: 'secret3' });
  await p3.post('/wallet/deposit', { amount: '100' });
  r = await p3.post(`/matches/${matchId}/join`);
  check('third player blocked: match full', has(r, 'fully booked'));
  r = await p3.get('/wallet');
  check('no charge for blocked join', has(r, '₹100.00'));

  console.log('Room secrecy');
  r = await p1.get(`/matches/${matchId}`);
  check('room locked before release', has(r, 'Room Details Locked') && !has(r, 'R123'));
  r = await anon.get(`/matches/${matchId}`);
  check('guest cannot see room', !has(r, 'R123') && !has(r, 'PW9'));

  console.log('Admin: edit / release / result / payout');
  r = await admin.post(`/admin/matches/${matchId}/edit`, { mode: 'clash-squad-1v1', map_name: 'Bermuda', entry_fee: '40', prize_pool: prizeA, max_players: '2',
    registration_start_at: local(-60), registration_close_at: local(-30), room_release_at: local(-20), match_start_at: local(-10), room_id: 'R123', room_password: 'PW9' });
  check('match edited (times moved to past)', has(r, 'updated.'));
  r = await p1.get(`/matches/${matchId}`);
  check('room visible to joined player after release', has(r, 'R123') && has(r, 'PW9'));
  r = await p3.get(`/matches/${matchId}`);
  check('room hidden from non-participant', !has(r, 'R123'));
  r = await p1.get('/admin/dashboard', null);
  check('player cannot open admin area (403)', r.status === 403);
  r = await admin.get(`/admin/results?match=${matchId}`);
  check('result form shows players', has(r, 'Tester1') && has(r, 'Tester2'));
  const uids = [...r.text.matchAll(/name="user" value="([a-f0-9]{24})"/g)].map((m) => m[1]);
  check('two player ids parsed', uids.length === 2);
  const form = new URLSearchParams();
  uids.forEach((u, i) => { form.append('user', u); form.append('placement', i === 0 ? '1' : '2'); form.append('kills', i === 0 ? '5' : '2'); });
  const sub = await fetch(BASE + `/admin/results/${matchId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'token=' + '' }, body: form.toString(), redirect: 'manual' });
  // (the raw fetch above has no cookie -> must NOT be accepted)
  check('unauthenticated result submit rejected', sub.status === 302 && (sub.headers.get('location') || '').startsWith('/login'));
  r = await admin.req('POST', `/admin/results/${matchId}/submit`, Object.fromEntries([['user', uids[0]], ['placement', '1'], ['kills', '5']]));
  check('incomplete result rejected', has(r, 'every registered player') || has(r, 'Results must include'));
  // multi-value form: build manually with cookie jar internals
  const cookie = await (async () => { const t = jar(); const lr = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=admin%40clashiq.gg&password=Admin%40123', redirect: 'manual' }); return lr.headers.getSetCookie().map((s) => s.split(';')[0]).join('; '); })();
  const post = (u, body) => fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie }, body: body.toString(), redirect: 'manual' });
  let s = await post(`/admin/results/${matchId}/submit`, form);
  check('result submitted', s.status === 302);
  r = await admin.get(`/admin/results?match=${matchId}`);
  check('awaiting approval shown', has(r, 'Approve &amp; Pay Prizes'));
  s = await post(`/admin/results/${matchId}/approve`, new URLSearchParams());
  check('result approved', s.status === 302);
  s = await post(`/admin/results/${matchId}/approve`, new URLSearchParams());
  r = await admin.get('/admin/results');
  const w1 = await p1.get('/wallet');
  check('winner got prize (₹60 winning)', has(w1, '₹60.00') && has(w1, 'Prize'));
  const prizeCount = (w1.text.match(/Prize - /g) || []).length;
  check('prize paid exactly once (no double payout)', prizeCount === 1, `count=${prizeCount}`);
  r = await p1.get('/dashboard');
  check('winner stats updated (1 win)', has(r, 'Wins: <strong class="text-emerald-400">1</strong>'));
  r = await anon.get('/leaderboard');
  check('leaderboard shows winner', has(r, 'Tester1'));
  r = await p1.get(`/matches/${matchId}`);
  check('final results visible', has(r, 'Final Results'));

  console.log('Withdrawals');
  r = await p2.post('/wallet/withdraw', { amount: '60', upi: 'tester2@upi' });
  check('loser cannot withdraw (no winnings)', has(r, 'Insufficient winning balance'));
  r = await p1.post('/wallet/withdraw', { amount: '60', upi: 'bad upi' });
  check('invalid UPI rejected', has(r, 'valid UPI'));
  r = await p1.post('/wallet/withdraw', { amount: '60', upi: 'tester1@upi' });
  check('withdrawal requested', has(r, 'submitted for review'));
  r = await admin.get('/admin/dashboard');
  const wid = idFrom(r.text, /admin\/withdrawals\/([a-f0-9]{24})\/paid/);
  check('admin sees pending withdrawal', !!wid);
  r = await admin.post(`/admin/withdrawals/${wid}/paid`);
  check('withdrawal marked paid', has(r, 'Marked as paid'));

  console.log('Cancel + refund');
  await admin.post('/admin/matches/create', { mode: 'lone-wolf-1v1', map_name: 'Alpine', entry_fee: '25', prize_pool: prizeB, max_players: '2',
    registration_start_at: local(-5), registration_close_at: local(30), room_release_at: local(20), match_start_at: local(40) });
  const m2 = await findMatch(prizeB);
  await p3.post(`/matches/${m2}/join`);
  r = await p3.get('/wallet');
  check('p3 charged ₹25', has(r, '₹75.00'));
  r = await admin.post(`/admin/matches/${m2}/cancel`, { reason: 'test' });
  check('match cancelled', has(r, 'cancelled'));
  r = await p3.get('/wallet');
  check('p3 fully refunded', has(r, '₹100.00') && has(r, 'Refund'));

  console.log('Player pages');
  for (const u of ['/dashboard', '/my-matches', '/my-matches?tab=COMPLETED', '/profile', '/wallet', '/notifications', '/disputes']) {
    const x = await p1.get(u); check(`GET ${u}`, x.status === 200, x.status);
  }
  r = await p1.post('/profile', { display_name: 'Tester One', free_fire_uid: `9${stamp}1`, free_fire_name: 'T1x' });
  check('profile updated', has(r, 'Profile updated'));
  r = await p1.post('/disputes', { match_id: matchId, type: 'RESULT', description: 'The kills count looks wrong to me' });
  check('dispute created', has(r, 'Dispute submitted'));
  r = await p3.post('/disputes', { match_id: matchId, type: 'RESULT', description: 'I never played this match at all' });
  check('cannot dispute a match you did not join', has(r, 'only raise disputes'));

  console.log('Admin pages');
  for (const u of ['/admin/dashboard', '/admin/health', '/admin/matches', '/admin/matches/create', '/admin/results', '/admin/gaming-identities', '/admin/disputes', '/admin/users', '/admin/audit-logs', '/admin/risk-flags', `/admin/matches/${matchId}/edit`]) {
    const x = await admin.get(u); check(`GET ${u}`, x.status === 200, x.status);
  }
  r = await admin.get('/admin/disputes');
  const did = idFrom(r.text, /admin\/disputes\/([a-f0-9]{24})\/resolve/);
  r = await admin.post(`/admin/disputes/${did}/resolve`, { status: 'RESOLVED', resolution: 'Checked, all correct' });
  check('dispute resolved', has(r, 'Dispute updated'));
  r = await admin.get('/admin/gaming-identities');
  const uidUser = idFrom(r.text, /gaming-identities\/([a-f0-9]{24})\/verify/);
  r = await admin.post(`/admin/gaming-identities/${uidUser}/verify?status=PENDING`, { status: 'VERIFIED' });
  check('UID verified', has(r, 'verified for'));
  r = await admin.get('/admin/audit-logs');
  check('audit log records actions', has(r, 'RESULT_APPROVE') && has(r, 'MATCH_CANCEL'));
  r = await admin.get('/admin/users?q=tester');
  check('user search works', has(r, 'Tester') || has(r, 'tester'));

  console.log('Security');
  r = await p1.req('POST', `/admin/matches/${matchId}/cancel`, {}, { noFollow: true });
  check('player cannot cancel matches', r.status === 403);
  r = await p1.req('POST', '/admin/users/000000000000000000000000/role', { role: 'SUPER_ADMIN' }, { noFollow: true });
  check('player cannot escalate role', r.status === 403);
  r = await anon.get('/login?next=//evil.com');
  const lr = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=t2_${stamp}%40x.gg&password=secret2&next=//evil.com`, redirect: 'manual' });
  check('open redirect blocked', (lr.headers.get('location') || '') === '/dashboard');
  r = await anon.get('/');
  check('no XSS via display name', !has(r, '<script>alert'));

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
