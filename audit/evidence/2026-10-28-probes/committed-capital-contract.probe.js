const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Scratch probe: P1 from Probe.ts, against this branch's contract with the same prices.
describe("PROBE committed-capital contract", function () {
  it("P1 strong demand: Alice 400 ETH at t=300, Bob 200 ETH at t=600", async function () {
    const [seller, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("NTUToken", ["NTU", "NTU", ethers.parseEther("1000")]);
    const auction = await ethers.deployContract("DutchAuction", [
      token.target, ethers.parseEther("1000"), ethers.parseEther("1"), ethers.parseEther("0.2"),
    ]);
    await token.approve(auction.target, ethers.parseEther("1000"));
    await auction.start();
    const start = await auction.startTime();
    await time.setNextBlockTimestamp(start + 300n);
    await auction.connect(alice).bid({ value: ethers.parseEther("400") });
    await time.setNextBlockTimestamp(start + 600n);
    await auction.connect(bob).bid({ value: ethers.parseEther("200") });
    console.log("finalized in Bob's tx:", await auction.finalized());
    await auction.connect(alice).claim();
    await auction.connect(bob).claim();
    console.log("clearing", ethers.formatEther(await auction.clearingPrice()),
      "| seller gets", ethers.formatEther(await auction.totalCommitted()),
      "| supply left", ethers.formatEther(await token.totalSupply()),
      "| Alice NTU", ethers.formatEther(await token.balanceOf(alice.address)),
      "| Bob NTU", ethers.formatEther(await token.balanceOf(bob.address)));
  });
});
