import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  ethToSellOut,
  minTokens,
  offsetForPrice,
  phaseOf,
  previewBid,
  priceAt,
  proRataTokens,
  sellOutOffset,
} from "./auction";

// Same parameters and scenarios as test/DutchAuction.test.js, so the UI and the contract agree
const params = { totalTokens: parseEther("1000"), startPrice: parseEther("0.1"), reservePrice: parseEther("0.02") };
const start = 1_000_000n;

describe("priceAt", () => {
  it("matches the contract's checkpoints with no truncation drift", () => {
    expect(priceAt(params, start, start)).toBe(parseEther("0.1"));
    expect(priceAt(params, start, start + 300n)).toBe(parseEther("0.08"));
    expect(priceAt(params, start, start + 600n)).toBe(parseEther("0.06"));
    expect(priceAt(params, start, start + 900n)).toBe(parseEther("0.04"));
    expect(priceAt(params, start, start + 1200n)).toBe(parseEther("0.02"));
    expect(priceAt(params, start, start + 5000n)).toBe(parseEther("0.02"));
  });

  it("quotes the start price before the auction starts", () => {
    expect(priceAt(params, 0n, start)).toBe(parseEther("0.1"));
  });
});

describe("previewBid", () => {
  it("caps a bid that bridges the threshold and refunds the surplus", () => {
    const preview = previewBid(params, parseEther("0.06"), parseEther("48"), parseEther("25"));
    expect(preview).toEqual({ accepted: parseEther("12"), refund: parseEther("13"), sellsOut: true });
  });

  it("accepts a bid in full while there is room", () => {
    const preview = previewBid(params, parseEther("0.08"), 0n, parseEther("48"));
    expect(preview).toEqual({ accepted: parseEther("48"), refund: 0n, sellsOut: false });
  });
});

describe("sell-out timing", () => {
  it("48 ETH sells out 1,000 TIM when the price reaches 0.048 ETH, at t = 780 s", () => {
    expect(sellOutOffset(params, parseEther("48"))).toBe(780n);
    expect(ethToSellOut(params, priceAt(params, start, start + 780n))).toBe(parseEther("48"));
  });

  it("returns null when the committed ETH cannot sell out above the reserve", () => {
    expect(sellOutOffset(params, parseEther("5"))).toBeNull();
  });

  it("marks the auction sold out between blocks, without waiting for a transaction", () => {
    const state = { startTime: start, finalized: false, totalCommitted: parseEther("48") };
    expect(phaseOf(params, state, start + 779n)).toBe("active");
    expect(phaseOf(params, state, start + 780n)).toBe("sold-out");
  });

  it("reports an expired, undersubscribed auction as ended", () => {
    const state = { startTime: start, finalized: false, totalCommitted: parseEther("5") };
    expect(phaseOf(params, state, start + 1200n)).toBe("ended");
  });
});

describe("token estimates", () => {
  it("gives a guaranteed minimum at the current price, and the pro-rata share after sell-out", () => {
    expect(minTokens(parseEther("48"), parseEther("0.08"))).toBe(parseEther("600"));
    expect(proRataTokens(params, parseEther("48"), parseEther("60"))).toBe(parseEther("800"));
  });

  it("maps a bid price back to its time for the chart", () => {
    expect(offsetForPrice(params, parseEther("0.06"))).toBe(600);
  });
});
