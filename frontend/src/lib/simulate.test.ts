import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { effectivePrice, project, simulate } from "./simulate";

const E = parseEther;
const params = { totalTokens: E("1000"), startPrice: E("0.1"), reservePrice: E("0.02") };

describe("project", () => {
  it("predicts a sell-out and a pro-rata share when the committed ETH is enough", () => {
    const result = project(params, E("15"), E("60"));
    expect(result.clearingPrice).toBe(E("0.06"));
    expect(result.tokens).toBe(E("250"));
    expect(result.sellsOutAt).toBe(600n);
  });

  it("predicts settling at the reserve when it is not", () => {
    const result = project(params, E("5"), E("10"));
    expect(result.clearingPrice).toBe(E("0.02"));
    expect(result.tokens).toBe(E("250"));
    expect(result.sellsOutAt).toBeNull();
  });

  it("gives nothing to a bidder with no stake", () => {
    expect(project(params, 0n, E("60")).tokens).toBe(0n);
    expect(project(params, 0n, 0n).tokens).toBe(0n);
  });
});

describe("simulate", () => {
  // The same numbers as the contract test "sells out on committed capital"
  const bids = [
    { name: "Alice", eth: E("48") },
    { name: "Bob", eth: E("12") },
  ];

  it("keeps running before the price meets the committed ETH", () => {
    const result = simulate(params, bids, 300n);
    expect(result.over).toBe(false);
    expect(result.price).toBe(E("0.08"));
    expect(result.needed).toBe(E("80"));
    expect(result.totalCommitted).toBe(E("60"));
  });

  it("sells out where the price meets the committed ETH, at one price for everyone", () => {
    const result = simulate(params, bids, 600n);
    expect(result.over).toBe(true);
    expect(result.endsAt).toBe(600n);
    expect(result.clearingPrice).toBe(E("0.06"));
    expect(result.tokensBurned).toBe(0n);
    expect(result.bidders.map((bidder) => bidder.tokens)).toEqual([E("800"), E("200")]);
    for (const bidder of result.bidders) {
      expect(effectivePrice(bidder.accepted, bidder.tokens)).toBe(E("0.06"));
    }
  });

  it("settles at the reserve and burns the rest if time runs out", () => {
    const result = simulate(params, [{ name: "Alice", eth: E("5") }], 1200n);
    expect(result.over).toBe(true);
    expect(result.endsAt).toBe(1200n);
    expect(result.clearingPrice).toBe(E("0.02"));
    expect(result.tokensSold).toBe(E("250"));
    expect(result.tokensBurned).toBe(E("750"));
  });

  it("refunds what no longer fits", () => {
    const result = simulate(params, [{ name: "Alice", eth: E("90") }, { name: "Bob", eth: E("30") }], 0n);
    expect(result.bidders[0].refund).toBe(0n);
    expect(result.bidders[1].accepted).toBe(E("10"));
    expect(result.bidders[1].refund).toBe(E("20"));
    expect(result.over).toBe(true);
  });
});
