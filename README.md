# Rebound Rider — BTC trading bot for make.fun

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Kroco365/btc-race-1123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Kroco365/btc-race-1123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A dip-recovery bot for the [btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511) bounty: it races a BTC trading bot live for 24 hours on Coinbase Wrapped BTC (cbBTC) 1-minute bars with $1,000 of paper money.

## Strategy

CBBTC trends, then gives back a slice of its recent gains. The bot:

- Buys all-in when the close sits at least **1.00% below the rolling 24-bar high**.
- Sells everything when the position is worth at least **3.00% over its cost basis** (fees included).
- Takes at most **3 round trips** per window, with a **12-bar cooldown** after each completed trip so one choppy dip cannot whipsaw it.
- Holds through pullbacks otherwise; any open position is flattened by the harness at the end of the window.

Exits compare the position's value at the current close against its cost basis via the SDK's `state.value()`, which handles the price/qty scales exactly. All arithmetic is exact `BigInt`: no clock, no randomness, no network, no files — the same bars always produce the same orders.

## Local dev grade

Graded with the kit's own CLI (`node cli/makefun.mjs grade-local --kit . --bot . --driver process --worktree`):

- **Net PnL: +32.02 USDC** on the frozen 24h dev window (return +3.20%)
- 3 trades, win rate 1.00, max drawdown 1.58%, guardrails met
- At 2x fees: +30.37 USDC

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's `sdk/makefun-bars.ts` shim
- `LICENSE` — MIT
