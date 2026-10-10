# ClashIQ – Free Fire Tournament Platform

**Node.js + Express + MongoDB (Mongoose) + EJS + Tailwind CSS** – one project, one command to run.
No React, no Vite, no separate frontend server. Pages are rendered on the server with EJS.

## Quick start (3 steps)

1. Install **Node.js 18+** and **MongoDB Community Server** (or use a free MongoDB Atlas URL).
2. In this folder run:
   ```bash
   npm install
   npm run seed      # creates admin, demo player and sample matches
   npm start         # open http://localhost:3000
   ```
3. Log in:

| Role   | Email                | Password    |
|--------|----------------------|-------------|
| Admin  | admin@clashiq.gg     | Admin@123   |
| Player | player@clashiq.gg    | Player@123  |

`.env` is already included with local defaults. **Change `JWT_SECRET`, `COOKIE_SECRET` and
`ROOM_ENCRYPTION_KEY` before deploying.** Use MongoDB Atlas by pasting its URL in `MONGO_URI`.

## Scripts
| Command | What it does |
|---|---|
| `npm start` | Run the site |
| `npm run dev` | Auto-restart on changes + rebuild Tailwind on changes |
| `npm run build:css` | Rebuild `public/css/app.css` (only needed if you change views/classes) |
| `npm run seed` | Create admin, demo player, sample matches (safe to run again) |
| `npm run test:smoke` | End-to-end test of all flows (start the server first) |

## Features (same as the original project)
Home, Register/Login, Dashboard, Matches (filters), Match detail with live countdown,
Join match (wallet), Room ID/Password revealed only to joined players after release time,
My Matches, Leaderboard, Wallet (deposit / withdraw / ledger), Notifications, Disputes, Profile,
Rules/Terms/Privacy, and a full **Admin panel**: dashboard, system health, create/edit/cancel
matches, result entry + approval (auto prize payout), UID verification, disputes, users & roles,
audit logs, risk flags, withdrawal approvals.

## Notes
* **Payments:** "Add Cash" is in **TEST MODE** (`TEST_MODE_DEPOSITS=true`): money is added instantly
  with no real payment. Set it to `false` and integrate a payment gateway (e.g. Razorpay) in
  `src/routes/player.js` before going live with real money. Withdrawals are requests that an admin
  marks paid after sending the UPI transfer manually.
* Match status (Registering → Room Ready → In Progress) is computed from the times, so no cron job is needed.
* Times are entered/shown in `APP_TIMEZONE` (default Asia/Kolkata).
* Real-money gaming has legal requirements in many regions – check local law before launching.

## Structure
```
src/
  server.js  app.js            entry + Express setup (helmet, CSP, cookies, EJS)
  config/                      env, db, game modes
  models/                      User, Wallet, Transaction, Match, Notification, Dispute, AuditLog
  services/                    wallet (atomic money ops), match (join/cancel/settle), notify/audit
  routes/                      auth, pages, matches, player, admin, api
  middleware/                  auth (JWT cookie), flash
views/                         EJS pages, partials, admin pages
public/  css/app.css js/app.js Tailwind output + small client script
scripts/ seed.js smoke-test.js
```
