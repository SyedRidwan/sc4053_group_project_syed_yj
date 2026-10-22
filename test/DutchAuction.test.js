const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DutchAuction Full Lifecycle & Security Suite", function () {
  let token, auction, attacker;
  let owner, alice, bob, charlie;

  const TOTAL_SUPPLY = ethers.parseEther("1000"); // 1,000 NTU
  const START_PRICE = ethers.parseEther("0.1");   // 0.10 ETH
  const RESERVE_PRICE = ethers.parseEther("0.02");// 0.02 ETH
  const DURATION = 20 * 60;                       // 1200 seconds (20 mins)

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const NTUToken = await ethers.getContractFactory("NTUToken");
    token = await NTUToken.deploy("NTU Launch Token", "NTU", TOTAL_SUPPLY);

    const DutchAuction = await ethers.getContractFactory("DutchAuction");
    auction = await DutchAuction.deploy(
      await token.getAddress(),
      TOTAL_SUPPLY,
      START_PRICE,
      RESERVE_PRICE
    );

    await token.transfer(await auction.getAddress(), TOTAL_SUPPLY);
  });

  it("1. Enforces exact linear price decay without integer truncation drift", async function () {
    const startTime = await auction.startTime();

    // At exactly t = 10 minutes (600s), price must be exactly 0.06 ETH (zero truncation error)
    await time.increaseTo(startTime + BigInt(DURATION / 2));
    expect(await auction.getCurrentPrice()).to.equal(ethers.parseEther("0.06"));

    // At t = 20 minutes (1200s), price reaches reservePrice (0.02 ETH)
    await time.increaseTo(startTime + BigInt(DURATION));
    expect(await auction.getCurrentPrice()).to.equal(RESERVE_PRICE);
  });

  it("2. Handles threshold-bridging bids and settles all bidders at uniform clearing price", async function () {
    const startTime = await auction.startTime();

    // At t = 5 mins (300s), price = 0.08 ETH. Alice commits 48 ETH -> locks 600 NTU
    await time.increaseTo(startTime + 299n);
    await auction.connect(alice).bid({ value: ethers.parseEther("48") });
    expect(await auction.allocatedTokens(alice.address)).to.equal(ethers.parseEther("600"));

    // At t = 15 mins (900s), price = 0.04 ETH. 400 NTU remain (cost = 16 ETH).
    // Bob submits 25 ETH (bridges across the 400 NTU threshold!)
    await time.increaseTo(startTime + 899n);
    await auction.connect(bob).bid({ value: ethers.parseEther("25") });

    expect(await auction.isFinalized()).to.equal(true);
    expect(await auction.clearingPrice()).to.equal(ethers.parseEther("0.04"));
    expect(await auction.allocatedTokens(bob.address)).to.equal(ethers.parseEther("400"));

    // Alice claims 600 NTU + 24 ETH surplus refund
    await auction.connect(alice).claimTokensAndRefund();
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("600"));

    // Bob claims 400 NTU + 9 ETH surplus refund
    await auction.connect(bob).claimTokensAndRefund();
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("400"));
  });

  it("3. Permanently burns unsold tokens from ERC20 totalSupply after 20 minutes", async function () {
    const startTime = await auction.startTime();

    // Alice buys 250 NTU at t = 10 mins (price = 0.06 ETH -> 15 ETH)
    await time.increaseTo(startTime + 599n);
    await auction.connect(alice).bid({ value: ethers.parseEther("15") });

    // 20-minute window elapses with 750 NTU unsold
    await time.increaseTo(startTime + BigInt(DURATION + 1));
    await auction.finalizeAuction();

    // Unsold 750 NTU must be burned from totalSupply (1000 -> 250 NTU)
    expect(await token.totalSupply()).to.equal(ethers.parseEther("250"));
  });

  it("4. Blocks reentrancy attack during ETH refund callback", async function () {
    const startTime = await auction.startTime();
    const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
    attacker = await ReentrancyAttacker.deploy(await auction.getAddress());

    // Attacker bids 8 ETH at t = 5 mins (price = 0.08 ETH -> 100 NTU)
    await time.increaseTo(startTime + 299n);
    await attacker.connect(charlie).placeMaliciousBid({ value: ethers.parseEther("8") });

    // Alice buys the remaining 900 NTU at t = 15 mins (price = 0.04 ETH -> 36 ETH)
    await time.increaseTo(startTime + 899n);
    await auction.connect(alice).bid({ value: ethers.parseEther("36") });

    // Attacker attempts recursive reentrancy during claimTokensAndRefund()
    await attacker.connect(charlie).executeAttack();
    expect(await attacker.reentrancySucceeded()).to.equal(false);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      ethers.parseEther("4")
    );
  });
});