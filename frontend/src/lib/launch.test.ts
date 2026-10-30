import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { validateLaunch, type LaunchForm } from "./launch";
import { parseRoute } from "./route";

const good: LaunchForm = { name: "Alpha", symbol: "ALP", supply: "1000", startPrice: "0.1", reservePrice: "0.02" };

describe("validateLaunch", () => {
  it("returns the on-chain values for a good form", () => {
    const { input, errors } = validateLaunch(good);
    expect(errors).toEqual({});
    expect(input).toEqual({
      name: "Alpha",
      symbol: "ALP",
      supply: parseEther("1000"),
      startPrice: parseEther("0.1"),
      reservePrice: parseEther("0.02"),
    });
  });

  // Same cases as "Parameter bounds" in test/LaunchFactory.test.js, so the form and the contract agree
  const rejected: [string, Partial<LaunchForm>, keyof LaunchForm][] = [
    ["an empty name", { name: " " }, "name"],
    ["a name over 32 bytes", { name: "x".repeat(33) }, "name"],
    ["a long name in multi-byte characters", { name: "é".repeat(17) }, "name"],
    ["an empty symbol", { symbol: "" }, "symbol"],
    ["a symbol over 11 bytes", { symbol: "x".repeat(12) }, "symbol"],
    ["a supply that is not a number", { supply: "lots" }, "supply"],
    ["zero supply", { supply: "0" }, "supply"],
    ["a supply under 1 token", { supply: "0.999999999999999999" }, "supply"],
    ["a huge supply", { supply: "1000000000000001" }, "supply"],
    ["a zero reserve", { reservePrice: "0" }, "reservePrice"],
    ["a reserve under 1 gwei", { reservePrice: "0.000000000999999999" }, "reservePrice"],
    ["a start price over the cap", { startPrice: "1000.000000000000000001" }, "startPrice"],
    ["a start equal to the reserve", { reservePrice: "0.1" }, "startPrice"],
    ["a nearly flat curve", { startPrice: "0.039999999999999999" }, "startPrice"],
    ["a raise under 0.001 ETH", { supply: "1", startPrice: "0.002", reservePrice: "0.000999999999999999" }, "reservePrice"],
  ];

  for (const [label, change, field] of rejected) {
    it(`rejects ${label}`, () => {
      const { input, errors } = validateLaunch({ ...good, ...change });
      expect(input).toBeNull();
      expect(errors[field]).toBeTruthy();
    });
  }

  it("accepts the smallest allowed raise", () => {
    expect(validateLaunch({ ...good, supply: "1", startPrice: "0.002", reservePrice: "0.001" }).input).not.toBeNull();
  });
});

describe("parseRoute", () => {
  it("maps hashes to pages", () => {
    expect(parseRoute("")).toEqual({ page: "market" });
    expect(parseRoute("#/")).toEqual({ page: "market" });
    expect(parseRoute("#/create")).toEqual({ page: "create" });
    expect(parseRoute("#/portfolio")).toEqual({ page: "portfolio" });
    expect(parseRoute("#/learn")).toEqual({ page: "learn" });
    expect(parseRoute("#/launch/12")).toEqual({ page: "launch", id: 12n });
  });

  it("treats anything else as not found", () => {
    expect(parseRoute("#/launch/abc")).toEqual({ page: "not-found" });
    expect(parseRoute("#/nope")).toEqual({ page: "not-found" });
  });
});
