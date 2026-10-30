// Client-side mirror of DutchAuction.sol's maths, so the price and countdown can update
// every second between RPC refreshes. All amounts are wei; prices are wei per whole token.

export const DURATION = 1200n;
export const TOKEN_UNIT = 10n ** 18n;

export interface AuctionParams {
  totalTokens: bigint;
  startPrice: bigint;
  reservePrice: bigint;
}

export type Phase = "not-started" | "active" | "sold-out" | "ended" | "finalized";

/** Same formula as `currentPrice()`: linear decay, multiplying before dividing. */
export function priceAt(params: AuctionParams, startTime: bigint, now: bigint): bigint {
  if (startTime === 0n) return params.startPrice;
  if (now >= startTime + DURATION) return params.reservePrice;
  const elapsed = now > startTime ? now - startTime : 0n;
  return params.startPrice - ((params.startPrice - params.reservePrice) * elapsed) / DURATION;
}

/** ETH needed to buy the whole supply at `price`. */
export function ethToSellOut(params: AuctionParams, price: bigint): bigint {
  return (params.totalTokens * price) / TOKEN_UNIT;
}

export function phaseOf(
  params: AuctionParams,
  state: { startTime: bigint; finalized: boolean; totalCommitted: bigint },
  now: bigint
): Phase {
  if (state.startTime === 0n) return "not-started";
  if (state.finalized) return "finalized";
  if (state.totalCommitted >= ethToSellOut(params, priceAt(params, state.startTime, now))) return "sold-out";
  if (now >= state.startTime + DURATION) return "ended";
  return "active";
}

export interface BidPreview {
  accepted: bigint;
  refund: bigint;
  /** True when this bid fills the remaining room and settles the auction */
  sellsOut: boolean;
}

/** What `bid()` would do with `value` at `price`: accept up to the room left, refund the rest. */
export function previewBid(params: AuctionParams, price: bigint, totalCommitted: bigint, value: bigint): BidPreview {
  const cap = ethToSellOut(params, price);
  const room = cap > totalCommitted ? cap - totalCommitted : 0n;
  const accepted = value < room ? value : room;
  return { accepted, refund: value - accepted, sellsOut: room > 0n && accepted === room };
}

/** The price at which the ETH committed so far buys the whole supply. */
export function impliedPrice(params: AuctionParams, totalCommitted: bigint): bigint {
  return (totalCommitted * TOKEN_UNIT) / params.totalTokens;
}

/**
 * Seconds after start when the falling price meets the implied price, i.e. when the auction
 * sells out if nobody else bids. Null if the committed ETH cannot sell out above the reserve.
 */
export function sellOutOffset(params: AuctionParams, totalCommitted: bigint): bigint | null {
  const implied = impliedPrice(params, totalCommitted);
  if (implied < params.reservePrice) return null;
  if (implied >= params.startPrice) return 0n;
  const drop = params.startPrice - implied;
  const range = params.startPrice - params.reservePrice;
  return (drop * DURATION + range - 1n) / range;
}

/**
 * Seconds of the price schedule that really ran. `currentPrice()` keeps falling after a sell-out, but by then it means
 * nothing, so anything shown to a person stops where the auction stopped: at the sell-out, or at 20 minutes.
 */
export function scheduleElapsed(params: AuctionParams, state: { startTime: bigint; totalCommitted: bigint }, now: bigint): bigint {
  const elapsed = now > state.startTime ? now - state.startTime : 0n;
  const stop = sellOutOffset(params, state.totalCommitted) ?? DURATION;
  return elapsed < stop ? elapsed : stop;
}

/** Tokens guaranteed at `price`: until sell-out the clearing price can only fall. */
export function minTokens(commitment: bigint, price: bigint): bigint {
  return price === 0n ? 0n : (commitment * TOKEN_UNIT) / price;
}

/** Tokens owed once the clearing price is fixed by a sell-out: a pro-rata share of the supply. */
export function proRataTokens(params: AuctionParams, commitment: bigint, totalCommitted: bigint): bigint {
  return totalCommitted === 0n ? 0n : (commitment * params.totalTokens) / totalCommitted;
}

/** Same as `_finalize()`: the tokens sold at a clearing price, capped at the supply. The rest are burned. */
export function tokensSoldAt(params: AuctionParams, totalCommitted: bigint, clearingPrice: bigint): bigint {
  if (clearingPrice === 0n) return 0n;
  const sold = (totalCommitted * TOKEN_UNIT) / clearingPrice;
  return sold < params.totalTokens ? sold : params.totalTokens;
}

/** Seconds into the auction at which the schedule reached `price` (for plotting bids). */
export function offsetForPrice(params: AuctionParams, price: bigint): number {
  const range = params.startPrice - params.reservePrice;
  if (range === 0n) return 0;
  const offset = Number(((params.startPrice - price) * DURATION) / range);
  return Math.min(Math.max(offset, 0), Number(DURATION));
}
