const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Hardhat launchpad tasks", function () {
  beforeEach(async function () {
    await hre.network.provider.send("hardhat_reset");
  });

  async function rows() {
    const file = path.join(__dirname, "..", "deployments", "launchpad-hardhat.json");
    const { factory: info } = JSON.parse(fs.readFileSync(file, "utf8"));
    const factory = await ethers.getContractAt("LaunchFactory", info.address);
    const page = await factory.getLaunches(0, 50);
    return { factory, bySymbol: Object.fromEntries(page.map((row) => [row.symbol, row])) };
  }

  it("launchpad:deploy records the factory and curator for the frontend", async function () {
    const deployment = await hre.run("launchpad:deploy");
    const [deployer] = await ethers.getSigners();
    expect(deployment.curator).to.equal(deployer.address);
    expect(deployment.chainId).to.equal(31337);
    const factory = await ethers.getContractAt("LaunchFactory", deployment.factory.address);
    expect(await factory.curator()).to.equal(deployer.address);
    expect(await factory.launchCount()).to.equal(0);
  });

  it("launchpad:seed fills the market with listings in every state", async function () {
    await hre.run("launchpad:seed", { expiresIn: 240 });
    const { factory, bySymbol } = await rows();
    expect(await factory.launchCount()).to.equal(6);
    const now = BigInt(await time.latest());

    expect(bySymbol.AUR.finalized).to.equal(true);
    expect(bySymbol.AUR.proceedsWithdrawn).to.equal(false);
    expect(bySymbol.AUR.supply * bySymbol.AUR.clearingPrice / 10n ** 18n).to.be.closeTo(bySymbol.AUR.totalCommitted, 10n ** 16n);

    // Sold half at the reserve and burned the rest
    const cobalt = await ethers.getContractAt("HortonsToken", bySymbol.COB.token);
    expect(bySymbol.COB.finalized).to.equal(true);
    expect(bySymbol.COB.proceedsWithdrawn).to.equal(true);
    expect(await cobalt.totalSupply()).to.equal(ethers.parseEther("500"));

    // Still running, close to expiry, and unable to sell out without far more ETH
    expect(bySymbol.NOVA.finalized).to.equal(false);
    expect(bySymbol.NOVA.endTime - now).to.be.closeTo(240n, 15n);

    // About halfway through
    expect(bySymbol.MRD.finalized).to.equal(false);
    expect(bySymbol.MRD.endTime - now).to.be.closeTo(600n, 15n);

    // A fresh listing with the whole window left
    expect(bySymbol.TIM.finalized).to.equal(false);
    expect(bySymbol.TIM.totalCommitted).to.equal(ethers.parseEther("25"));
    expect(bySymbol.TIM.endTime - now).to.be.closeTo(1200n, 15n);

    expect(bySymbol.TIM.verified).to.equal(true);
    expect(bySymbol.FREE.verified).to.equal(false);
    expect(bySymbol.FREE.hidden).to.equal(false);
  });

  it("Nova burns its unsold supply once it expires", async function () {
    await hre.run("launchpad:seed", { expiresIn: 240 });
    const { bySymbol } = await rows();
    await time.increaseTo(bySymbol.NOVA.endTime + 1n);
    const auction = await ethers.getContractAt("DutchAuction", bySymbol.NOVA.auction);
    const token = await ethers.getContractAt("HortonsToken", bySymbol.NOVA.token);
    await auction.finalize();
    expect(await auction.tokensSold()).to.equal(ethers.parseEther("1250")); // 5 ETH at the 0.004 reserve
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1250"));
  });

  // The video plan relies on the longer countdowns, so check the whole accepted range
  for (const expiresIn of [30, 360, 361, 600]) {
    it(`launchpad:seed leaves Nova live for ${expiresIn} seconds`, async function () {
      await hre.run("launchpad:seed", { expiresIn });
      const { bySymbol } = await rows();
      const remaining = bySymbol.NOVA.endTime - BigInt(await time.latest());
      expect(remaining).to.be.closeTo(BigInt(expiresIn), 20n);
      expect(bySymbol.NOVA.totalCommitted).to.equal(ethers.parseEther("5"));
      expect(bySymbol.NOVA.finalized).to.equal(false);
    });
  }

  it("launchpad:seed rejects an expiry too close or too far", async function () {
    await expect(hre.run("launchpad:seed", { expiresIn: 5 })).to.be.rejectedWith("--expires-in");
    await expect(hre.run("launchpad:seed", { expiresIn: 900 })).to.be.rejectedWith("--expires-in");
  });
});
