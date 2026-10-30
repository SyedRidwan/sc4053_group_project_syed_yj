// Answers "what happens if...": where a bidder's stake is heading, and the How it works simulator. Every result uses the
// same rules as DutchAuction.sol, through the helpers in auction.ts.

import {
  DURATION,
  ethToSellOut,
  impliedPrice,
  priceAt,
  sellOutOffset,
  TOKEN_UNIT,
  tokensSoldAt,
  type AuctionParams,
} from "./auction";

export interface Projection {
  clearingPrice: bigint;
  tokens: bigint;
  /** Seconds after the start when it sells out, or null if it runs out of time and settles at the reserve */
  sellsOutAt: bigint | null;
}

/** The outcome for one bidder if nobody else bids from now on. */
export function project(params: AuctionParams, commitment: bigint, totalCommitted: bigint): Projection {
  const sellsOutAt = sellOutOffset(params, totalCommitted);
  const implied = impliedPrice(params, totalCommitted);
  const clearingPrice = implied > params.reservePrice ? implied : params.reservePrice;
  if (totalCommitted === 0n) return { clearingPrice, tokens: 0n, sellsOutAt };
  const sold = tokensSoldAt(params, totalCommitted, clearingPrice);
  return { clearingPrice, tokens: (commitment * sold) / totalCommitted, sellsOutAt };
}

export interface SimulatedBid {
  name: string;
  eth: bigint;
}

export interface SimulatedBidder {
  name: string;
  accepted: bigint;
  refund: bigint;
  tokens: bigint;
}

export interface Simulation {
  price: bigint;
  totalCommitted: bigint;
  /** ETH that would buy the whole supply at the current price */
  needed: bigint;
  over: boolean;
  /** Seconds after the start when the auction ends, whichever way */
  endsAt: bigint;
  clearingPrice: bigint;
  tokensSold: bigint;
  tokensBurned: bigint;
  bidders: SimulatedBidder[];
}

/** Plays bids placed in order at the very start, then reports the auction at `elapsed` seconds. */
export function simulate(params: AuctionParams, bids: SimulatedBid[], elapsed: bigint): Simulation {
  const cap = ethToSellOut(params, params.startPrice);
  let total = 0n;
  const accepted = bids.map((bid) => {
    const take = bid.eth < cap - total ? bid.eth : cap - total;
    total += take;
    return take;
  });

  const price = priceAt(params, 1n, elapsed + 1n); // A start time of 1, because 0 means "not started"
  const needed = ethToSellOut(params, price);
  const sellsOutAt = total === 0n ? null : sellOutOffset(params, total);
  const endsAt = sellsOutAt ?? DURATION;
  const over = elapsed >= endsAt;

  const implied = impliedPrice(params, total);
  const clearingPrice = implied > params.reservePrice ? implied : params.reservePrice;
  const tokensSold = tokensSoldAt(params, total, clearingPrice);

  return {
    price,
    totalCommitted: total,
    needed,
    over,
    endsAt,
    clearingPrice,
    tokensSold,
    tokensBurned: params.totalTokens - tokensSold,
    bidders: bids.map((bid, index) => ({
      name: bid.name,
      accepted: accepted[index],
      refund: bid.eth - accepted[index],
      tokens: total === 0n ? 0n : (accepted[index] * tokensSold) / total,
    })),
  };
}

/** What a token costs a bidder in practice: their ETH divided by their tokens. */
export const effectivePrice = (accepted: bigint, tokens: bigint) => (tokens === 0n ? 0n : (accepted * TOKEN_UNIT) / tokens);
