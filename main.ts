// Rebound Rider: a dip-recovery bot for the make.fun btc-race-24h-20261123-0511 bounty.
//
// The idea: CBBTC trends, then gives back a slice of its recent gains. Buy all-in when
// the close sits at least DIP_BPS below the rolling LOOKBACK-bar high, sell everything
// when the close recovers TAKE_BPS above the entry cost basis, or cut the trade when it
// falls STOP_BPS under it. At most MAX_TRIPS round trips per window, with a short
// cooldown after each completed trip so one choppy dip cannot whipsaw the bot.
//
// All arithmetic is exact BigInt; there is no clock, no randomness, no network and no
// file access, so the same bars always produce the same orders. Orders decided on bar k
// fill at bar k + 1's open; the harness flattens any open position at the end.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 24;
const DIP_BPS = 100n; // buy when the close is >= 1.00% under the rolling high
const TAKE_BPS = 300n; // sell when the position is worth >= 3.00% over its cost
const STOP_BPS = 0n; // 0 disables the stop-loss: no hard cut, the trailing stop guards instead
const TRAIL_BPS = 0n; // 0 disables the trailing stop: sell when the close falls this far under the highest close since entry
const MAX_TRIPS = 3;
const COOLDOWN_BARS = 12;
const MAX_SLIPPAGE_BPS = 300;

const closes: bigint[] = [];
let trips = 0;
let cooldownUntil = -1;
let holding = false;
let peakClose = 0n; // highest close seen while holding the current position

/** The highest close of the last LOOKBACK closes, including the latest one. */
function rollingHigh(): bigint {
  let hi = 0n;
  const start = closes.length > LOOKBACK ? closes.length - LOOKBACK : 0;
  for (let i = start; i < closes.length; i++) {
    if (closes[i]! > hi) hi = closes[i]!;
  }
  return hi;
}

await runBars({
  onBatch(state: BarsState, batch) {
    for (const b of batch.bars) {
      if (b.symbol === SYMBOL) closes.push(BigInt(b.c));
    }
    if (state.warmingUp) return [];

    const close = state.close(SYMBOL);
    if (close === null) return [];
    const held = state.positions.get(SYMBOL);
    const orders: (BuyInput | SellInput)[] = [];

    // A position that was here last batch and is gone now is a completed round trip.
    if (held === undefined && holding) {
      trips += 1;
      cooldownUntil = state.seq + COOLDOWN_BARS;
      peakClose = 0n;
    }
    holding = held !== undefined;

    if (held !== undefined) {
      // Exit on take-profit, stop-loss or trailing stop, measured on the position's
      // VALUE at the current close against its cost basis (fees included). Comparing
      // raw cost/qty against the close would mix units: cost is in quote raw units
      // (1e-6 USDC) and qty in 1e-8 BTC, while the close is priced at
      // price_scale 5. state.value() handles the scales, so compare value to cost.
      // The trailing stop compares closes to closes, so it needs no conversion.
      if (close > peakClose) peakClose = close;
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      const take = value * BPS >= cost * (BPS + TAKE_BPS);
      const stop = STOP_BPS > 0n && value * BPS <= cost * (BPS - STOP_BPS);
      const trail = TRAIL_BPS > 0n && peakClose > 0n && close * BPS <= peakClose * (BPS - TRAIL_BPS);
      if (take || stop || trail) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
      return orders;
    }

    // Flat: look for a dip buy.
    if (trips >= MAX_TRIPS) return [];
    if (state.seq < cooldownUntil) return [];
    if (closes.length < LOOKBACK) return [];
    const hi = rollingHigh();
    if (hi === 0n) return [];
    if (close * BPS <= hi * (BPS - DIP_BPS)) {
      const { fees } = state.hello;
      let notional = state.cash;
      const byWeight = state.weightRoom(SYMBOL);
      if (notional > byWeight) notional = byWeight;
      if (notional === 0n || notional < BigInt(fees.min_notional_quote_units)) return [];
      orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS });
    }
    return orders;
  },
});
