# What was wrong in the original zip, and how it was fixed

The original "MERN" project could not run as delivered. Problems found and fixed:

| # | Problem in original | Fix |
|---|---|---|
| 1 | `frontend/src/lib/auth-context.tsx` imported `./firebase`, a file that does not exist -> build failed | Firebase removed; plain email/password auth with a secure cookie |
| 2 | `AdminLayout` used an undefined variable `router` -> crash on every admin page | Rewritten as a server-rendered admin shell with role checks |
| 3 | `Navbar`, `MobileNav`, `MatchCard`, dashboard, etc. used `<Link href=...>` (Next.js syntax) with React Router's `Link` (needs `to`) -> every link was broken | All links are plain server-rendered `<a href>` |
| 4 | Frontend expected fields like `match_start_at`, `entry_fee_minor`, `public_match_code`, `wallet.available_balance_formatted`, `tx.direction`... but the backend returned `startTime`, `entryFeePaise`, ... -> pages showed blank/NaN | One consistent data model; views render the real fields |
| 5 | Backend route `/matches/my` was declared **after** `/matches/:id`, so "my matches" was treated as an ID | Correct route order + ID validation (bad IDs return 404, not a crash) |
| 6 | Register form sent display name / UID / nickname, but backend ignored them; UID was never stored | UID + nickname are validated, unique, stored, and admin-verifiable |
| 7 | Frontend read `res.error.message` but backend sent `message` -> errors never displayed | Server-rendered form errors and flash messages |
| 8 | Joining a match never charged the entry fee; wallet was never credited; no prizes; no room credentials endpoint (`/matches/:id/room` did not exist) | Real wallet ledger, atomic entry-fee charge, refunds, prize payout, encrypted room credentials released at the right time |
| 9 | Admin result approval just flipped a status; no payout | Approve -> pays winners once (idempotent), updates stats, notifies |
| 10 | Many admin endpoints returned empty arrays (audit logs, risk flags, UID list, results) | Fully implemented |
| 11 | JWT secret fell back to a hard-coded default; refresh "token" was just the same token; any user could call `admin/*` roles list incl. SUPPORT | HttpOnly SameSite cookie, strict role checks per page, audit log of admin actions |
| 12 | Race condition: two quick clicks could join twice / overspend | Atomic DB updates + idempotency keys (verified: 6 simultaneous joins charge once) |
| 13 | Hard-coded APK download link to a third-party GitHub repo | Removed |
| 14 | `Express 5` + mixed configs, Next/Vite leftovers, `tsconfig.tsbuildinfo`, unused `packages/types` | Clean single project |

## Verified
`npm run test:smoke` runs ~100 end-to-end checks (register, login, deposit, join, full-match blocking,
room secrecy, result -> approval -> prize (paid exactly once), withdrawal, cancel + refund, disputes,
UID verification, all admin pages, and security checks such as 403s and open-redirect blocking).
All pass.
