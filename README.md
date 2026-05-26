# Prediction Leagues

A **prediction leagues mini-app** built on [Base](https://base.org) for the Farcaster / Coinbase ecosystem.

Players create or join tournament-based leagues, predict match outcomes across football, CS2, and NBA, and stake USDC into a shared pool — the highest-scoring player wins it all. In case of a tie the pool is split equally.

---

## Features

- **Multi-sport predictions** — Football (football-data.org), CS2 (PandaScore), NBA (RapidAPI)
- **Tournament-based lifecycle** — league ends when all tournament matches are finished, no fixed duration
- **On-chain USDC pool** — funds held in `PredictionPoolFee.sol` escrow on Base; payout triggered automatically
- **5% platform fee** — collected at deposit time so the pool always shows the exact prize amount
- **Tie splitting** — `payoutMultiple()` divides the pool equally among all tied winners (dust goes to last winner)
- **Two-phase creation** — backend registers the league on-chain (owner-only), user only approves + deposits
- **Farcaster mini-app** — runs natively inside Base App / Warpcast via MiniKit
- **Wallet integration** — Coinbase Smart Wallet + OnchainKit
- **Live leaderboards** — real-time ranking via Supabase
- **Dark & light themes** — CSS-variable system with manual toggle, persists in localStorage
- **Push notifications** — Farcaster frame notifications for results and payouts

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| Chain | Base mainnet / Base Sepolia |
| Wallet | Coinbase Smart Wallet + OnchainKit |
| Database | Supabase (Postgres + Realtime + RLS) |
| Smart Contract | Solidity 0.8.35 (`PredictionPoolFee.sol`) |
| Token | USDC (ERC-20, 6 decimals) |
| Mini-app SDK | MiniKit (Base App) |
| Styling | CSS Modules, dark/light theme via CSS variables |

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Coinbase Developer Platform](https://portal.cdp.coinbase.com) OnchainKit API key
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

Fill in all values — see [Environment Variables](#environment-variables) below.

### 3. Set up the database

Run the SQL files in your Supabase SQL editor in order:

```
supabase/schema.sql                         # Tables, views, RLS policies
supabase/notification_tokens.sql            # Farcaster push token table
supabase/migrations/add_competition_id.sql  # Tournament-based league support
supabase/migrations/add_ends_at.sql         # Ends-at timestamp for leagues
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Sports APIs
FOOTBALL_DATA_API_KEY=                      # football-data.org (free)
PANDASCORE_API_KEY=                         # pandascore.co — CS2 (free, 1000 req/h)
RAPIDAPI_KEY=                               # RapidAPI — nba-api-free-data.p.rapidapi.com

# On-chain signer
POOL_SIGNER_PRIVATE_KEY=                    # hot wallet — registers leagues and triggers payouts

# Admin & cron
ADMIN_SECRET=
CRON_SECRET=
NOTIFY_SECRET=

# Webhooks (optional)
FARCASTER_WEBHOOK_SECRET=
PANDASCORE_WEBHOOK_SECRET=

# Optional
RPC_URL=                                    # Alchemy / Infura RPC (falls back to public Base RPC)
```

> ⚠️ **Never commit `.env.local`** — it is already in `.gitignore`.  
> ⚠️ `POOL_SIGNER_PRIVATE_KEY` controls real funds on mainnet. Use a dedicated hot wallet with only the minimum balance needed for gas.

---

## Project Structure

```
app/
├── page.tsx                        # Home — league feed
├── leagues/[id]/                   # League detail — matches, standings, history
├── leagues/create/                 # Create wizard (4 steps: name → sport → tournament → fee)
├── leagues/join/                   # Join by invite code
├── leaderboard/                    # Global user leaderboard
├── profile/                        # User profile & prediction history
├── admin/                          # Admin panel (ADMIN_SECRET gated)
├── actions/                        # Server actions
│   ├── create-league.ts            # Save league to DB + background match sync
│   ├── join-league.ts              # Add member to DB
│   ├── fetch-tournaments.ts        # Return available tournaments per sport
│   ├── register-league-onchain.ts  # Hot wallet calls createLeague() on-chain
│   ├── save-prediction.ts          # Upsert a prediction row
│   ├── sync-matches.ts             # Pull fixtures from sports API into DB
│   └── upsert-profile.ts           # Create / update user profile
└── api/
    ├── admin/
    │   ├── finalise-league/        # Score predictions + on-chain payout (single or split)
    │   ├── sync-matches/           # Pull fixtures from sports APIs
    │   └── search-tournaments/     # PandaScore tournament lookup
    ├── matches/[id]/result/        # Record a match result & score predictions
    └── cron/
        ├── sync-matches/           # Twice daily: pull new fixtures for active leagues
        ├── update-results/         # Every 15 min: poll for finished match results
        └── finalise-leagues/       # Daily: auto-finalise completed tournaments

contracts/
└── PredictionPoolFee.sol           # USDC escrow with 5% fee at deposit

lib/
├── contracts.ts                    # ABI, helpers (leagueIdToBytes32, buildDepositCalls)
├── fetch-matches.ts                # Sports API fetch logic (football / CS2 / NBA)
├── mock.ts                         # Mock data for local dev without Supabase
├── supabase.ts                     # Supabase client init
├── types.ts                        # Shared TypeScript types
└── hooks/                          # React hooks (useLeagues, useProfile, etc.)

supabase/
├── schema.sql                      # Full DB schema, views, RLS policies
├── notification_tokens.sql         # Farcaster notification token storage
└── migrations/
    ├── add_competition_id.sql      # Adds competition_id for tournament linking
    └── add_ends_at.sql             # Adds ends_at timestamp column
```

---

## Smart Contract

`PredictionPoolFee.sol` — USDC escrow with 5% platform fee collected at deposit:

1. **`createLeague(leagueId, entryFee)`** — `onlyOwner`; backend hot wallet registers the league
2. **`deposit(leagueId)`** — player approves `entryFee × 1.05` USDC; contract pulls the full amount, forwards 5% to `feeRecipient` immediately, adds `entryFee` to pool
3. **`payout(leagueId, winner)`** — `onlyOwner`; sends full pool to the single winner
4. **`payoutMultiple(leagueId, winners[])`** — `onlyOwner`; splits pool equally among tied winners (dust goes to last winner)

The on-chain `leagueId` is `keccak256(toHex(supabaseUUID))`.

**Deployed addresses:**

| Network | Contract | Address |
|---|---|---|
| Base Sepolia | `PredictionPoolFee.sol` | `0x76BeBcDF89363E81Fb9960453A9BAb457EC2F2bC` |
| Base Sepolia | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base mainnet | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### League creation flow

```
1. User fills wizard (name → sport → tournament → fee)
2. "Create League" → server action registerLeagueOnChain()
   └─ hot wallet calls createLeague(bytes32, uint96) on-chain
3. Fee buttons lock — cannot change fee after on-chain registration
4. Transaction component appears
   └─ User approves entryFee × 1.05 USDC + calls deposit()
5. On tx success → createLeagueAction() saves league to DB
   └─ after() triggers background match sync
```

### Payout flow

```
Cron (09:00 UTC) → /api/cron/finalise-leagues
  → checks all active leagues for completed tournaments
  → POST /api/admin/finalise-league
      → queries leaderboard for top score
      → fetches ALL members with that score
      → if 1 winner:  payout(leagueId, winner)
      → if tie:       payoutMultiple(leagueId, [w1, w2, ...])
      → sends Farcaster push notifications
```

---

## Sports Data

| Sport | Provider | Tournaments |
|---|---|---|
| Football | [football-data.org](https://www.football-data.org) (free) | PL, CL, Bundesliga, Serie A, La Liga, Ligue 1 + more |
| CS2 | [PandaScore](https://pandascore.co) (free, 1 000 req/h) | Any running/upcoming tournament (searchable) |
| NBA | [RapidAPI — nba-api-free-data](https://rapidapi.com/api-sports/api/nba-api-free-data) (free) | NBA Regular Season, Playoffs |

Results are polled automatically every 15 minutes via cron — no inbound webhooks required.

---

## Deployment (Vercel)

1. Push to GitHub and connect the repo in [Vercel](https://vercel.com)
2. Add all environment variables in **Settings → Environment Variables** — set them for **Production**, **Preview**, and **Development**
3. Cron jobs are defined in `vercel.json`:
   - `0 9 * * *` — finalise-leagues (daily 09:00 UTC)
   - `0 */12 * * *` — sync-matches (twice daily)
   - `*/15 * * * *` — update-results (every 15 min; Hobby plan: once daily)
4. Set `NEXT_PUBLIC_URL` to your production Vercel URL

### Mainnet deployment checklist

1. Deploy `PredictionPoolFee.sol` from main wallet with:
   - `_usdc`: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - `_feeRecipient`: wallet that receives platform fees
2. Copy contract address → set `NEXT_PUBLIC_POOL_ADDRESS` in Vercel
3. BaseScan → Write Contract → `transferOwnership(hotWallet)`
4. Verify contract on BaseScan (single file, compiler v0.8.35)
5. Update `NEXT_PUBLIC_CHAIN_ID=8453` in Vercel
6. Redeploy

---

## License

MIT
