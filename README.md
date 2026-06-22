# Prediction Leagues

A **prediction leagues mini-app** built on [Base](https://base.org) for the Farcaster / Coinbase ecosystem.

Players create or join tournament-based leagues, predict match outcomes across football, CS2, and NBA, and stake USDC into a shared pool. Top scorers win the pool — winner-take-all for small leagues, a 60/30/10 podium split for leagues of four or more.

---

## Features

- **Multi-sport predictions** — Football ([football-data.org](https://www.football-data.org)), CS2 ([PandaScore](https://pandascore.co)), NBA ([ESPN public API](https://site.api.espn.com), no key)
- **Curated major events** — World Cup, Champions League, top-5 leagues; NBA Finals/Playoffs/Cup; S/A-tier CS2 tournaments only
- **Tournament-based lifecycle** — league ends when all its matches finish; stale/empty leagues are auto-voided after 14 days
- **On-chain USDC pool** — funds held in `PredictionPoolFee.sol` escrow on Base; the contract is the source of truth for money
- **Podium payouts** — `payoutSplit(leagueId, winners[], sharesBps[])`: winner-take-all, equal tie-split, or 60/30/10 podium (4+ players); ties share the sum of the positions they span
- **Refunds** — under-filled (`min_players` not reached) or dead leagues are voided and refunded on-chain via `refund()`
- **5% platform fee** — collected at deposit time so the pool always shows the exact prize
- **Wallet-bound sessions** — SIWE-style signature proves wallet ownership; server actions are bound to the verified wallet, and a deposit is tied to the wallet that actually paid (no misattribution)
- **Self-recovery** — a wallet that paid on-chain but wasn't recorded can claim membership without paying again
- **Live standings** — real-time leaderboard with win streaks, last-5 form, and accuracy
- **Prediction nudges** — Farcaster push to members who haven't predicted a match starting soon
- **Discover** — search, sport filter, and trending (by pool / players) sort
- **Farcaster mini-app** — runs natively inside Base App / Warpcast via MiniKit
- **Dark & light themes** — CSS-variable system, persists in localStorage

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Chain | Base mainnet / Base Sepolia |
| Wallet | Coinbase Smart Wallet + OnchainKit + wagmi |
| Database | Supabase (Postgres + Realtime + RLS) |
| Smart Contract | Solidity 0.8.35 (`PredictionPoolFee.sol`) |
| Token | USDC (ERC-20, 6 decimals) |
| Mini-app SDK | MiniKit (Base App) |
| Tests | Vitest |
| Cron | GitHub Actions (Vercel Hobby cron is daily-only) |
| Styling | CSS Modules, dark/light theme via CSS variables |

---

## Architecture — sources of truth

The app keeps three concerns in separate authoritative stores. Most early bugs came from the DB trying to mirror on-chain money and drifting; the rule below is now enforced:

| Concern | Source of truth | Notes |
|---|---|---|
| **Money** (pool, deposits, payouts) | **Smart contract** | Payouts read `getPool` on-chain; `pool_usdc` in the DB is a cache reconciled to `getPool` every cron tick |
| **Scoring** (predictions, points, rank) | **Database** | Predictions are off-chain by design |
| **Identity** (who acted) | **Session cookie** | Bound to the connected wallet via signature; deposits verified against the wallet that actually paid |

A wallet's membership is derived from on-chain `Deposited` events — see the integrity audit below.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Coinbase Developer Platform](https://portal.cdp.coinbase.com) OnchainKit API key (and a Base RPC endpoint)
- A funded wallet on Base Sepolia (testnet) or Base (mainnet)

### 1. Clone and install

```bash
git clone https://github.com/serg2708/prediction-leagues.git
cd prediction-leagues
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in all values — see [Environment Variables](#environment-variables).

### 3. Set up the database

Run `supabase/schema.sql` in the Supabase SQL editor (it includes tables, the leaderboard view, indexes, RLS, and SECURITY DEFINER functions). Then apply every file in `supabase/migrations/` in filename order.

> ⚠️ `20260610_abandoned_matches.sql` runs `ALTER TYPE … ADD VALUE` — execute it on its own (it can't share a transaction with other statements).

### 4. Run

```bash
npm run dev          # dev server at http://localhost:3000
npm test             # Vitest unit/integration tests
npm run audit:integrity        # report DB↔chain drift (add --fix to repair)
```

---

## Environment Variables

```env
# App
NEXT_PUBLIC_URL=                            # e.g. https://prediction-leagues.vercel.app
NEXT_PUBLIC_PROJECT_NAME=prediction-leagues
NEXT_PUBLIC_BUILDER_CODE=                   # Coinbase builder code for smart wallet

# OnchainKit
NEXT_PUBLIC_ONCHAINKIT_API_KEY=

# Chain
NEXT_PUBLIC_CHAIN_ID=84532                  # 8453 for mainnet
NEXT_PUBLIC_POOL_ADDRESS=<contract_address>
RPC_URL=                                    # CDP / Alchemy Base RPC — strongly recommended
                                            # (public RPC rate-limits signature & deposit verification)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Sports APIs
FOOTBALL_DATA_API_KEY=                      # football-data.org (free) — WC also available
PANDASCORE_API_KEY=                         # pandascore.co — CS2 (free, 1000 req/h)
                                            # NBA uses ESPN's public API — no key needed

# On-chain signer (the contract owner)
POOL_SIGNER_PRIVATE_KEY=                    # hot wallet — registers leagues, pays out, refunds

# Secrets
SESSION_SECRET=                             # HMAC key for wallet sessions (≥32 chars). Falls back to ADMIN_SECRET if unset
ADMIN_SECRET=                               # admin panel + server-to-server cron auth
CRON_SECRET=                                # GitHub Actions → cron endpoints
NOTIFY_SECRET=                              # internal notify endpoint

# Webhooks (optional)
FARCASTER_WEBHOOK_SECRET=
PANDASCORE_WEBHOOK_SECRET=
```

> ⚠️ **Never commit `.env.local`** — it is in `.gitignore`.
> ⚠️ `POOL_SIGNER_PRIVATE_KEY` controls real funds and must be the contract **owner**. Use a dedicated hot wallet with minimal balance.

---

## Project Structure

```
app/
├── page.tsx                        # Home — league feed + Discover (search/filter/sort)
├── leagues/[id]/                   # League detail — matches, standings (streaks/form), history
├── leagues/create/                 # Create wizard (name → sport → tournament → fee)
├── leagues/join/                   # Join by invite code; "already paid → Enter" recovery
├── leaderboard/ · profile/         # Global leaderboard & user history
├── admin/                          # Admin panel (cookie session via /api/admin/login)
├── actions/                        # Server actions
│   ├── create-league.ts            # Verify deposit (real payer) → save league → bg match sync
│   ├── join-league.ts              # Verify deposit (real payer) → join_league RPC (atomic, idempotent)
│   ├── claim-membership.ts         # Recover membership for a wallet that already paid on-chain
│   ├── register-league-onchain.ts  # Owner hot wallet calls createLeague()
│   ├── save-prediction.ts          # Upsert prediction (locked at kickoff)
│   ├── sync-matches.ts             # Thin wrapper over syncLeaguesGrouped
│   ├── fetch-tournaments.ts        # Curated major events per sport
│   └── upsert-profile.ts           # Create / update profile (session-bound)
└── api/
    ├── session/                    # SIWE wallet session: POST sign-in, GET current, DELETE
    ├── admin/
    │   ├── login/ · ping/          # Admin session cookie
    │   ├── finalise-league/        # min_players gate → podium payoutSplit → notify
    │   ├── refund-league/          # On-chain refund() of a voided league
    │   ├── delete-league/          # Delete a pending league
    │   ├── register-league/        # Re-register a league on the current contract
    │   ├── sync-matches/ · search-tournaments/
    ├── matches/[id]/result/        # Record result, award points, payout if last match
    ├── webhook/ · webhook/pandascore/   # Farcaster + PandaScore webhooks (HMAC verified)
    └── cron/
        ├── sync-matches/           # Daily: pull fixtures (grouped, one call per competition)
        ├── update-results/         # 15 min: poll results; abandon phantom matches >24h
        ├── finalise-leagues/       # 30 min: reconcile pools, void/finalise, payout
        └── notify-upcoming/        # Hourly: nudge members who haven't predicted

contracts/PredictionPoolFee.sol     # USDC escrow: deposit (5% fee), payout, payoutSplit, refund

lib/
├── contracts.ts                    # ABI + helpers (leagueIdToBytes32, buildDepositCalls)
├── verify-deposit.ts               # Binds a deposit tx to the wallet that paid (shared by create/join)
├── payout-shares.ts                # Podium/tie share computation (basis points)
├── reconcile.ts                    # reconcileLeaguePool — DB pool ← on-chain getPool
├── sync-leagues.ts                 # Grouped fixture sync (one API call per competition)
├── fetch-matches.ts                # Sports API fetch (football / CS2 / NBA)
├── session.ts · signin-message.ts  # HMAC wallet session (server) + canonical sign-in message
├── rate-limit.ts · server-auth.ts  # In-memory rate limiter + admin/cron/notify auth
└── hooks/                          # React hooks (useProfile, useLeague, useStandingsStats, …)

scripts/audit-integrity.mjs         # Sweep all leagues, reconcile DB↔chain (--fix to apply)

supabase/schema.sql + migrations/   # Schema, indexes, RLS, SECURITY DEFINER functions
```

---

## Smart Contract

`PredictionPoolFee.sol` — USDC escrow, 5% platform fee taken at deposit. The on-chain `leagueId` is `keccak256(toHex(supabaseUUID))`.

| Function | Access | Purpose |
|---|---|---|
| `createLeague(leagueId, entryFee)` | owner | register a league |
| `deposit(leagueId)` | player | pull `entryFee × 1.05`, forward 5% to `feeRecipient`, add `entryFee` to pool |
| `payout(leagueId, winner)` | owner | full pool to one winner |
| `payoutMultiple(leagueId, winners[])` | owner | equal split (kept for compat) |
| `payoutSplit(leagueId, winners[], sharesBps[])` | owner | **shares-based payout (shares sum to 10 000)** — used for podium & ties |
| `refund(leagueId, players[])` | owner | refund depositors of a voided league; sets `voided`, blocking payout |
| `hasDeposited` · `getPool` · `getEntryFee` · `isPaid` · `isVoided` | view | reads |

**Deployed (Base Sepolia):**

| Item | Address |
|---|---|
| `PredictionPoolFee.sol` | `0x34034Abfb4A370BDe22Aa8B9F71B08b43A4Cf96C` |
| USDC (Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDC (mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

> Redeploying the contract changes `NEXT_PUBLIC_POOL_ADDRESS`; leagues created on a previous contract stay there. Use the admin **Re-register on chain** button to register an existing league on the current contract so deposits work.

### Lifecycle

```
Create:  registerLeagueOnChain() [owner] → user approve+deposit → createLeagueAction()
         (verifies the Deposited event was emitted by the session wallet)

Join:    user approve+deposit → joinLeagueAction() → join_league() RPC (atomic, idempotent)
         already paid but not recorded? → "Enter league" → claimMembershipAction()

Result:  cron update-results → /api/matches/[id]/result → award_points → payout if last match

Finalise (cron, 30 min): reconcile pool ← getPool · void+refund if < min_players or stale ·
         else podium/tie payoutSplit · notify
```

---

## Sports Data

| Sport | Provider | Notes |
|---|---|---|
| Football | football-data.org (free) | WC, CL, PL, La Liga, Serie A, Bundesliga, Ligue 1. Cup fixtures with undecided teams are skipped until teams are set |
| CS2 | PandaScore (free, 1000 req/h) | S/A-tier tournaments, searchable in admin |
| NBA | ESPN public API | no key; pulls the next 5 days of games |

Results poll every 15 min; a PandaScore webhook records CS2 results instantly.

---

## Testing & integrity

- `npm test` — Vitest. Covers fee math & `leagueIdToBytes32`, HMAC sessions, rate limiting, grouped sync, podium/tie shares, and the **deposit-misattribution guard** (`verify-deposit`).
- `npm run audit:integrity` — sweeps non-finished leagues, compares `pool_usdc` vs `getPool` and members vs on-chain `Deposited` events; `--fix` reconciles in bulk.

---

## Deployment

**Vercel** — connect the repo, set all env vars for Production/Preview/Development, set `NEXT_PUBLIC_URL`.

**Cron runs on GitHub Actions** (`.github/workflows/`), not Vercel cron (Hobby is daily-only). Set repo secrets `CRON_SECRET` and `NEXT_PUBLIC_URL`:

| Workflow | Schedule |
|---|---|
| update-results | every 15 min |
| finalise-leagues | every 30 min |
| notify-upcoming | hourly |
| sync-matches | daily 05:00 UTC |

### Mainnet checklist

1. Deploy `PredictionPoolFee.sol` (Remix, compiler 0.8.35) **from the hot-wallet** so `owner` = `POOL_SIGNER_PRIVATE_KEY`'s address, with `_usdc` = mainnet USDC and `_feeRecipient` = your fee wallet (a multisig is fine).
2. Set `NEXT_PUBLIC_POOL_ADDRESS` (new), `NEXT_PUBLIC_CHAIN_ID=8453`, and `RPC_URL` (mainnet) in Vercel.
3. Verify on BaseScan (single file, v0.8.35) and redeploy.

---

## License

MIT
