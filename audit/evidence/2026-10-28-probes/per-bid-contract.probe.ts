import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { formatEther, parseEther } from "viem";

// Scratch probes: same scenarios run against both branches' contracts.
describe("PROBE yj contract", function () {
  async function setup(fund = true) {
    const { viem, networkHelpers } = await network.create();
    const [seller, alice, bob] = await viem.getWalletClients();
    const pc = await viem.getPublicClient();
    const token = await viem.deployContract("AuctionToken", [1000n]);
    const auction = await viem.deployContract("DutchAuction", [
      token.address, parseEther("1"), parseEther("0.2"), parseEther("1000"),
    ]);
    if (fund) await token.write.transfer([auction.address, parseEther("1000")]);
    const start = await auction.read.startTime();
    const as = (w: any) => viem.getContractAt("DutchAuction", auction.address, { client: { wallet: w } });
    return { viem, networkHelpers, seller, alice, bob, pc, token, auction, start, as };
  }

  it("P1 strong demand that never fills by quantity", async function () {
    const { networkHelpers, alice, bob, pc, token, auction, start, as } = await setup();
    await networkHelpers.time.setNextBlockTimestamp(start + 300n);
    await (await as(alice)).write.bid([], { value: parseEther("400") });
    await networkHelpers.time.setNextBlockTimestamp(start + 600n);
    await (await as(bob)).write.bid([], { value: parseEther("200") });
    console.log("soldOut after 600 ETH at P=0.6:", await auction.read.soldOut());
    await networkHelpers.time.setNextBlockTimestamp(start + 1200n);
    await auction.write.finalizeAuction();
    await (await as(alice)).write.claim();
    await (await as(bob)).write.claim();
    console.log("clearing", formatEther(await auction.read.clearingPrice()),
      "| seller proceeds", formatEther(await auction.read.sellerProceeds()),
      "| supply left", formatEther(await token.read.totalSupply()),
      "| contract ETH dust (wei)", await pc.getBalance({ address: auction.address }) - (await auction.read.sellerProceeds()));
  });

  it("P2 seller cannot withdraw while bidders have not claimed", async function () {
    const { networkHelpers, alice, auction, start, as } = await setup();
    await (await as(alice)).write.bid([], { value: parseEther("100") });
    await networkHelpers.time.setNextBlockTimestamp(start + 1200n);
    await auction.write.finalizeAuction();
    await assert.rejects(auction.write.withdrawProceeds(), /No proceeds available/);
    console.log("seller blocked until Alice claims: confirmed");
  });

  it("P3 unfunded auction accepts bids, then cannot settle", async function () {
    const { networkHelpers, alice, pc, auction, start, as } = await setup(false);
    await (await as(alice)).write.bid([], { value: parseEther("100") });
    console.log("unfunded bid accepted; ETH held:", formatEther(await pc.getBalance({ address: auction.address })));
    await networkHelpers.time.setNextBlockTimestamp(start + 1200n);
    await assert.rejects(auction.write.finalizeAuction());
    await assert.rejects((await as(alice)).write.claim());
    console.log("finalize and claim both revert: Alice's 100 ETH is locked");
  });
});
