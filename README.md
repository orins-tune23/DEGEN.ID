# DEGEN.ID

**Your wallet doesn't lie. We just translate it.**

> Live: [https://degen-id.vercel.app/](https://degen-id.vercel.app/)

DEGEN.ID is a Solana wallet personality profiler. Paste any wallet address and get a full behavioral analysis — scored across 7 dimensions, classified into one of 10 savage archetypes, and rendered as a dark luxury shareable report.

---

## Birdeye API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `/v1/wallet/token_list` | Fetch full token holdings and USD values for a wallet |
| `/v1/wallet/tx/list` | Retrieve complete swap transaction history |
| `/defi/token_overview` | Token metadata — liquidity, market cap, creation date |
| `/defi/price` | Current token prices for P&L calculation |
| `/defi/ohlcv` | Historical OHLCV candles for entry/exit timing analysis |
| `/defi/token_security` | Rug/flag detection — top holder %, mutability |
| `/defi/v2/tokens/new_listing` | Recent token listings for early entry scoring |

All Birdeye API calls are server-side only. The API key is never exposed to the client. Every call is logged to `api_calls.log` with timestamp, endpoint, identifier, and status code.

---

## Scoring Dimensions

| # | Dimension | Description |
|---|---|---|
| 1 | Win Rate | % of closed positions that were profitable |
| 2 | Diamond Hands Score | Average hold duration weighted by position size |
| 3 | Entry Timing | How early vs peak the wallet enters tokens |
| 4 | Exit Discipline | Take profit ratio vs bagholding to zero |
| 5 | Risk Appetite | Position sizing relative to total wallet value |
| 6 | Degen Index | Frequency of new/micro-cap token interaction |
| 7 | Survival Rate | % of traded tokens that are still alive |

---

## Archetypes

| Emoji | Name | Description |
|---|---|---|
| 🧠 | THE DEGEN ARCHAEOLOGIST | Digs through garbage looking for gems. Finds mostly garbage. |
| 🎰 | THE CASINO GHOST | All volume, no wins. Moves fast, loses faster. |
| 🐋 | THE SILENT WHALE | Large positions, long holds, doesn't need your validation. |
| 💎 | THE DIAMOND MONK | Buys, holds, does not panic. Possibly dead. |
| 🤡 | THE PERPETUAL BAGHOLDER | Arrives late to every party and stays until the lights go off. |
| 🦅 | THE APEX SNIPER | Early entries, clean exits. Suspiciously good. |
| 🧻 | THE PAPER HAND PROPHET | Sells everything at -20% before it 10xs without them. |
| 🔥 | THE CHAOS AGENT | No pattern, no strategy, just pure vibes and volume. |
| 😴 | THE HIBERNATOR | Last active 6 months ago. Either retired or rugged into oblivion. |
| 🎯 | THE ONE-HIT WONDER | Had one legendary trade and has been chasing that feeling ever since. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     DEGEN.ID                            │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Homepage │  │ Wallet Report│  │   Leaderboard    │  │
│  │  /       │  │ /wallet/[addr│  │   /leaderboard   │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘  │
│       │               │                   │             │
│       ▼               ▼                   ▼             │
│  ┌─────────────────────────────────────────────────┐    │
│  │              API Routes (Server)                │    │
│  │  /api/wallet/[address]  /api/leaderboard        │    │
│  └───────────┬─────────────────────┬───────────────┘    │
│              │                     │                    │
│  ┌───────────▼───────────┐  ┌─────▼──────────────┐     │
│  │   Birdeye Client      │  │   SQLite Cache     │     │
│  │   lib/birdeye.ts      │  │   lib/db.ts        │     │
│  │                       │  │   better-sqlite3   │     │
│  │  • token_list         │  │                    │     │
│  │  • tx/list            │  │  • wallet reports  │     │
│  │  • token_overview     │  │  • leaderboard     │     │
│  │  • price              │  │  • 10min TTL       │     │
│  │  • ohlcv              │  │                    │     │
│  │  • token_security     │  └────────────────────┘     │
│  │  • new_listing        │                              │
│  └───────────┬───────────┘                              │
│              │                                          │
│  ┌───────────▼───────────┐                              │
│  │   Scorer Engine       │                              │
│  │   lib/scorer.ts       │                              │
│  │   lib/archetypes.ts   │                              │
│  │   lib/verdicts.ts     │                              │
│  └───────────────────────┘                              │
│                                                         │
│  Components: IdentityCard, PersonalityRadar,            │
│  GreatestHits, BehaviourBreakdown, TradingTimeline,     │
│  ShareCard, SearchBar, LoadingOverlay                   │
└─────────────────────────────────────────────────────────┘
```

---

## Setup

```bash
git clone https://github.com/orins-tune23/DEGEN.ID.git
cd DEGEN.ID
cp .env.example .env          # Add your BIRDEYE_API_KEY
npm install
npm run dev                   # → http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BIRDEYE_API_KEY` | — | Birdeye API key (required for real data; demo mode without) |
| `NEXT_PUBLIC_SITE_URL` | `https://degen-id.vercel.app/` | Public site URL for OG cards |
| `CACHE_DURATION_MS` | `600000` | Cache TTL in ms (default 10 min) |
| `RATE_LIMIT_RPS` | `10` | Max Birdeye API calls per second |

---

## Tech Stack

- **Next.js 14** — App Router, server components, API routes
- **TypeScript** — Strict mode, no `any`
- **Tailwind CSS** — Design tokens via CSS variables
- **Recharts** — Radar chart and trading timeline
- **better-sqlite3** — SQLite cache (Vercel-compatible with /tmp)
- **html2canvas** — PNG share card generation
- **Google Fonts** — Syne (display) + Space Mono (mono)

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/orins-tune23/DEGEN.ID)

Add `BIRDEYE_API_KEY` to Vercel environment variables. The app runs in demo mode without it.

---

Built for **Birdeye Data BIP Competition Sprint 3 — May 2026**

**#BirdeyeAPI @birdeye_data**
