# EdgeTrack

**Know your numbers. Every bet counts.**

EdgeTrack is a private, mobile-first betting tracker. You record bets, settle them, and it works out your real P/L, ROI, win rate and analytics, and keeps a bankroll ledger.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn-style Radix components, Recharts, React Hook Form + Zod, date-fns, and Supabase (Auth + Postgres with RLS).

## Features

- **Overview:** net P/L (with % change vs the previous period), ROI, win rate, total staked, total bets, pending bets and stake, average odds, and best bet. Every figure is calculated from your records.
- **Add / edit bets:** validated form with a live payout, profit and return-% preview, and warnings when a stake is large relative to your bankroll.
- **My Bets:** search, filter (status, sport, type, sportsbook, date), sorting, pagination, settle, edit, duplicate, delete (with a confirmation), a details view and CSV export. Shows a table on desktop and cards on mobile.
- **Analytics:** cumulative P/L (daily, weekly, monthly or per bet), outcome mix, and P/L by sport, by bet type, by odds range and by stake size, plus ROI by sportsbook. Also shows streaks, largest win and loss, and average winning and losing odds.
- **Bankroll:** initial balance, deposits and withdrawals in a separate audited ledger, a growth chart, stake as % of the bankroll at the time each bet was placed, and stake-warning settings.
- **Settings:** currency (INR by default), date format, odds precision, default stake and status, default date range, password change, CSV and JSON backup, and restore.
- **One global date filter** shared by the overview, bets and analytics screens.

## Settlement rules (`src/lib/settlement.ts`)

| Status | Payout (incl. stake) | Net profit |
|---|---|---|
| Pending | — | — (excluded from P/L, ROI, win rate) |
| Won | stake × odds | stake × (odds − 1) |
| Lost | 0 | −stake |
| Void / Push | stake | 0 (not a win or a loss) |
| Half Won | stake + profit | stake × (odds − 1) ÷ 2 |
| Half Lost | stake + profit | −stake ÷ 2 |
| Cashed Out | cash-out amount | cash-out − stake |

- **Win rate** = wins ÷ (wins + losses).
- **ROI** = realised P/L ÷ settled stake × 100.

Money is calculated in integer minor units using BigInt, rounding half away from zero. The database computes the same `payout` and `net_profit` values as generated columns, so the app and the database always agree.

## Quick start (local mode)

```bash
npm install
npm run dev
```

If Supabase isn't configured, EdgeTrack runs in **local mode**:

- On your first visit you create your username and password.
- Only a salted PBKDF2-SHA256 hash of the password is stored.
- Data is kept in this browser's `localStorage`.
- Sessions expire after 60 minutes idle or 12 hours total, and sign-in locks after 5 failed attempts.

Local mode is fine for trying the app out, but it is **not** server-side security. Use Supabase for real privacy and cross-device sync.

## Production setup (Supabase)

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Run the migrations:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   The migrations create `profiles`, `bets`, `bankroll_transactions`, `audit_log` and `login_attempts`, with constraints, indexes, triggers and row-level security. Each user can only ever read or write their own rows.
3. **Deploy the username-login function.** Supabase Auth signs users in by email, so this Edge Function looks up the account for a username on the server. Email addresses are never exposed to the browser. It also throttles brute-force attempts.
   ```bash
   npx supabase functions deploy username-login --no-verify-jwt
   npx supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com   # optional CORS lock-down
   ```
4. **Lock down Auth** in the dashboard:
   - Authentication → Providers → Email: **disable sign-ups**.
   - Optionally set a session timebox or inactivity timeout under Auth → Sessions.
5. **Create your account (server-side only).** Pass the credentials as environment variables at run time; they are never written to the repo:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
   EDGETRACK_USERNAME='<username>' \
   EDGETRACK_PASSWORD='<password>' \
   npm run create-user
   ```
   Running it again for an existing username resets that account's password. Change the password from **Settings** after your first sign-in.
6. **Configure the frontend.** Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_IDLE_TIMEOUT_MINUTES` (optional)

   Never put the service-role key in a `VITE_` variable.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend | Public anon key (data is protected by RLS) |
| `VITE_IDLE_TIMEOUT_MINUTES` | frontend | Sign out after this many idle minutes (default 60) |
| `SUPABASE_SERVICE_ROLE_KEY` | `create-user` script only | Admin key — keep it secret |
| `EDGETRACK_USERNAME` / `EDGETRACK_PASSWORD` / `EDGETRACK_EMAIL` | `create-user` script only | Initial account |

## Testing

```bash
npm test              # Vitest: settlement, stats, bankroll, dates, validation, auth, isolation, UI flow
npm run typecheck
npm run build
npx supabase start && npx supabase test db   # pgTAP: RLS isolation, constraints, DB settlement maths
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push.

## Deployment

Build with `npm run build` and serve the `dist/` folder from any static host:

- **Vercel:** `vercel.json` contains the SPA rewrites and security headers.
- **Netlify / Cloudflare Pages:** `public/_redirects` and `public/_headers` do the same job.

Set the `VITE_*` variables in your host's settings, and add your site URL to Supabase Auth → URL configuration.

## Project structure

```
src/
  lib/          settlement, money, stats, bankroll, dateRange, validation, csv, format
  data/         repository + auth interfaces; Supabase and local implementations
  context/      Auth, Data and DateRange providers
  components/   UI primitives, bet form & dialogs, charts, layout
  pages/        Overview, My Bets, Analytics, Bankroll, Settings, Login
supabase/
  migrations/   schema, constraints, RLS, triggers
  functions/    username-login Edge Function
  tests/        pgTAP RLS isolation tests
scripts/        create-user.mjs (server-side account provisioning)
```
