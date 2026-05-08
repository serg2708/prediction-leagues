# Prediction Leagues

A **winner-takes-all USDC prediction leagues** mini-app built on [Base](https://base.org) for the Farcaster / Coinbase ecosystem.

Players create or join leagues, predict match outcomes across football, CS2, and NBA, and stake USDC into a shared pool — the highest-scoring player wins it all.

---

## Features

- **Multi-sport predictions** — Football (football-data.org), CS2 (PandaScore), NBA (BallDontLie)
- **On-chain USDC pool** — funds held in `PredictionPool.sol` escrow on Base; payout triggered automatically
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
| Smart Contract | Solidity 0.8.35 |
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
git clone https://github.com/serg2708/base_app.git
cd base_app
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in all values — see [Environment Variables](#environment-variables) below.

### 3. Set up the database

Run the SQL files in your Supabase SQL editor in this order:

```
supabase/schema.sql               # Tables, views, RLS policies
supabase/notification_tokens.sql  # Farcaster push token table
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```
# App
NEXT_PUBLIC_URL=http://localhost:3000

# Coinbase Developer Platform
NEXT_PUBLIC_ONCHAINKIT_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only

# Smart contract
NEXT_PUBLIC_POOL_ADDRESS=         # deployed PredictionPool address
NEXT_PUBLIC_CHAIN_ID=84532        # 84532 = Sepolia, 8453 = mainnet

# Sports data APIs
FOOTBALL_DATA_API_KEY=            # football-data.org (free tier)
PANDASCORE_API_KEY=               # pandascore.co (free tier)
BALLDONTLIE_API_KEY=              # balldontlie.io (optional)

# API auth secrets (generate with: openssl rand -hex 24)
ADMIN_SECRET=
NOTIFY_SECRET=
CRON_SECRET=

# Webhooks (optional)
FARCASTER_WEBHOOK_SECRET=
PANDASCORE_WEBHOOK_SECRET=

# On-chain payout signer — NEVER expose client-side
POOL_SIGNER_PRIVATE_KEY=
RPC_URL=                          # optional: Alchemy/Infura RPC
```

> ⚠️ **Never commit `.env.local`** — it is already in `.gitignore`.  
> ⚠️ `POOL_SIGNER_PRIVATE_KEY` controls real funds on mainnet. Use a dedicated hot wallet with only the minimum balance needed for gas.

---

## Project Structure

```
app/
├── page.tsx                      # Home — league feed
├── leagues/[id]/                 # League detail — matches, standings, history
├── leagues/create/               # Create wizard (3 steps)
├── leagues/join/                 # Join by invite code
├── leaderboard/                  # Global user leaderboard
├── profile/                      # User profile & prediction history
├── admin/                        # Admin panel (ADMIN_SECRET gated)
└── api/
    ├── admin/
    │   ├── finalise-league/      # Score all predictions + trigger on-chain payout
    │   ├── sync-matches/         # Pull fixtures from sports APIs
    │   └── search-tournaments/   # PandaScore tournament lookup
    ├── matches/[id]/result/      # Record a match result & score predictions
    ├── cron/                     # Vercel cron jobs (auto sync + result polling)
    ├── webhook/                  # Farcaster frame webhooks (notifications)
    └── webhook/pandascore/       # PandaScore result webhooks

contracts/
└── PredictionPool.sol            # USDC escrow — createLeague, deposit, payout

lib/
├── contracts.ts                  # ABI, helpers (leagueIdToBytes32, buildDepositCalls)
├── supabase.ts                   # Supabase client init
├── types.ts                      # Shared TypeScript types
└── hooks/                        # React hooks (useLeagues, useProfile, etc.)

supabase/
├── schema.sql                    # Full DB schema, views, RLS policies
└── notification_tokens.sql       # Farcaster notification token storage
```

---

## Smart Contract

`PredictionPool.sol` — a minimal USDC escrow:

1. **`createLeague(leagueId, entryFee)`** — admin registers a league on-chain
2. **`deposit(leagueId)`** — player approves USDC then deposits entry fee
3. **`payout(leagueId, winner)`** — admin pays the whole pool to the winner

The on-chain `leagueId` is `keccak256(abi.encodePacked(supabaseUUID))`.

**Deployed addresses:**

| Network | Address |
|---|---|
| Base Sepolia (testnet) | `0x31ba2DD2028E3CED203Bd475Eaf44369642bb062` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDC (Base mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### Redeploy to Sepolia

```bash
# Install Foundry: https://getfoundry.sh
forge create contracts/PredictionPool.sol:PredictionPool \
  --constructor-args 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_KEY
```

---

## Sports Data

| Sport | Provider | How results arrive |
|---|---|---|
| Football | [football-data.org](https://www.football-data.org) (free) | Cron every 15 min |
| CS2 | [PandaScore](https://pandascore.co) (free, 1 000 req/h) | Cron every 15 min |
| NBA | [BallDontLie](https://balldontlie.io) (free) | Cron every 15 min |

Results are polled automatically — no inbound webhooks required for basic operation.

---

## Deployment (Vercel)

1. Push to GitHub and connect the repo in [Vercel](https://vercel.com)
2. Add all environment variables in **Settings → Environment Variables**
3. Cron jobs are defined in `vercel.json` — they run on the Hobby plan at 15-min intervals
4. Set `NEXT_PUBLIC_URL` to your production Vercel URL

---

## License

MIT
