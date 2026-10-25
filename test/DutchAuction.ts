import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

describe("DutchAuction - Price Decay", function () {

  async function deployAuction() {
    const { viem, networkHelpers } = await network.create();

    // 1. Deploy Hortons (TIM)
    const token = await viem.deployContract(
      "AuctionToken",
      [1000n]
    );

    // 2. Auction parameters
    const startPrice = parseEther("1");
    const reservePrice = parseEther("0.2");
    const tokensForSale = parseEther("1000");

    // 3. Deploy Dutch Auction
    // Constructor now requires FOUR parameters
    const auction = await viem.deployContract(
      "DutchAuction",
      [
        token.address,
        startPrice,
        reservePrice,
        tokensForSale,
      ]
    );

    return {
      auction,
      token,
      networkHelpers,
    };
  }

  it("should start at approximately 1 ETH", async function () {
    const { auction } = await deployAuction();

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Starting price:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("1")
    );
  });

  it("should fall to 0.8 ETH after 5 minutes", async function () {
    const {
      auction,
      networkHelpers
    } = await deployAuction();

    await networkHelpers.time.increase(300);

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Price after 5 min:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("0.8")
    );
  });

  it("should fall to 0.6 ETH after 10 minutes", async function () {
    const {
      auction,
      networkHelpers
    } = await deployAuction();

    await networkHelpers.time.increase(600);

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Price after 10 min:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("0.6")
    );
  });

  it("should fall to 0.4 ETH after 15 minutes", async function () {
    const {
      auction,
      networkHelpers
    } = await deployAuction();

    await networkHelpers.time.increase(900);

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Price after 15 min:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("0.4")
    );
  });

  it("should reach reserve price after 20 minutes", async function () {
    const {
      auction,
      networkHelpers
    } = await deployAuction();

    await networkHelpers.time.increase(1200);

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Price after 20 min:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("0.2")
    );
  });

  it("should never fall below reserve price", async function () {
    const {
      auction,
      networkHelpers
    } = await deployAuction();

    await networkHelpers.time.increase(1500);

    const price =
      await auction.read.getCurrentPrice();

    console.log(
      "Price after 25 min:",
      formatEther(price),
      "ETH"
    );

    assert.equal(
      price,
      parseEther("0.2")
    );
  });

});