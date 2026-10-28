const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Ported from test/AuctionToken.ts on the dutch-auction-token-launch branch (commit 792b50d)

const E = ethers.parseEther;
const TOTAL_SUPPLY = E("1000"); // 1,000 TIM

async function deployFixture() {
  const [deployer, other] = await ethers.getSigners();
  const token = await ethers.deployContract("HortonsToken", ["Horton's", "TIM", TOTAL_SUPPLY]);
  return { token, deployer, other };
}

describe("HortonsToken", function () {
  it("has the configured name and symbol, and 18 decimals", async function () {
    const { token } = await loadFixture(deployFixture);

    expect(await token.name()).to.equal("Horton's");
    expect(await token.symbol()).to.equal("TIM");
    expect(await token.decimals()).to.equal(18n);
  });

  it("mints the whole initial supply to the deployer, once", async function () {
    const { token, deployer, other } = await loadFixture(deployFixture);

    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(await token.balanceOf(deployer.address)).to.equal(TOTAL_SUPPLY);
    expect(await token.balanceOf(other.address)).to.equal(0);
  });

  it("permanently reduces totalSupply when a holder burns", async function () {
    const { token, deployer } = await loadFixture(deployFixture);

    await expect(token.burn(E("100")))
      .to.emit(token, "Transfer")
      .withArgs(deployer.address, ethers.ZeroAddress, E("100"));
    expect(await token.totalSupply()).to.equal(E("900"));
    expect(await token.balanceOf(deployer.address)).to.equal(E("900"));
  });

  it("does not let anyone burn tokens they neither hold nor were approved for", async function () {
    const { token, deployer, other } = await loadFixture(deployFixture);

    await expect(token.connect(other).burnFrom(deployer.address, 1n))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    await expect(token.connect(other).burn(1n))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
  });
});
