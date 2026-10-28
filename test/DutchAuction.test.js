const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const E = ethers.parseEther;
const TOTAL_SUPPLY = E("1000"); // 1,000 NTU
const START_PRICE = E("0.1"); // 0.10 ETH per NTU
const RESERVE_PRICE = E("0.02"); // 0.02 ETH per NTU
const DURATION = 20n * 60n; // 1200 seconds

async function deployFixture() {
  const [seller, alice, bob, charlie, ...others] = await ethers.getSigners();

  const NTUToken = await ethers.getContractFactory("NTUToken");
  const token = await NTUToken.deploy("NTU Launch Token", "NTU", TOTAL_SUPPLY);

  const DutchAuction = await ethers.getContractFactory("DutchAuction");
  const auction = await DutchAuction.deploy(await token.getAddress(), TOTAL_SUPPLY, START_PRICE, RESERVE_PRICE);

  return { token, auction, seller, alice, bob, charlie, others };
}

async function startedFixture() {
  const f = await deployFixture();
  await f.token.approve(await f.auction.getAddress(), TOTAL_SUPPLY);
  await f.auction.start();
  return { ...f, startTime: await f.auction.startTime() };
}

// Sends a bid that lands exactly `t` seconds after the auction started
async function bidAt(f, signer, t, value) {
  await time.setNextBlockTimestamp(f.startTime + BigInt(t));
  return f.auction.connect(signer).bid({ value });
}

describe("DutchAuction", function () {
  describe("Deployment and start", function () {
    it("rejects invalid constructor parameters", async function () {
      const { token } = await loadFixture(deployFixture);
      const DutchAuction = await ethers.getContractFactory("DutchAuction");
      const tokenAddress = await token.getAddress();

      await expect(DutchAuction.deploy(ethers.ZeroAddress, TOTAL_SUPPLY, START_PRICE, RESERVE_PRICE))
        .to.be.revertedWith("Invalid token address");
      await expect(DutchAuction.deploy(tokenAddress, 0, START_PRICE, RESERVE_PRICE))
        .to.be.revertedWith("Invalid token supply");
      await expect(DutchAuction.deploy(tokenAddress, TOTAL_SUPPLY, RESERVE_PRICE, RESERVE_PRICE))
        .to.be.revertedWith("Invalid prices");
      await expect(DutchAuction.deploy(tokenAddress, TOTAL_SUPPLY, START_PRICE, 0))
        .to.be.revertedWith("Invalid prices");
    });

    it("does not accept bids before start, and quotes the start price", async function () {
      const { auction, alice } = await loadFixture(deployFixture);

      expect(await auction.currentPrice()).to.equal(START_PRICE);
      expect(await auction.isActive()).to.equal(false);
      await expect(auction.connect(alice).bid({ value: E("1") })).to.be.revertedWith("Auction not active");
    });

    it("start() pulls the full sale supply and opens a 20-minute window", async function () {
      const { token, auction, seller } = await loadFixture(deployFixture);
      const auctionAddress = await auction.getAddress();
      await token.approve(auctionAddress, TOTAL_SUPPLY);

      const tx = auction.start();
      await expect(tx).to.changeTokenBalances(token, [seller, auction], [-TOTAL_SUPPLY, TOTAL_SUPPLY]);
      const startTime = await auction.startTime();
      await expect(tx).to.emit(auction, "AuctionStarted").withArgs(startTime, startTime + DURATION);
      expect(await auction.endTime()).to.equal(startTime + DURATION);
      expect(await auction.isActive()).to.equal(true);
    });

    it("start() is seller-only, single-use and requires token approval", async function () {
      const { token, auction, alice } = await loadFixture(deployFixture);

      await expect(auction.connect(alice).start()).to.be.revertedWith("Only seller");
      await expect(auction.start()).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");

      await token.approve(await auction.getAddress(), TOTAL_SUPPLY);
      await auction.start();
      await expect(auction.start()).to.be.revertedWith("Already started");
    });
  });

  describe("Price decay", function () {
    it("decays linearly with no truncation drift", async function () {
      const f = await loadFixture(startedFixture);
      const checkpoints = [
        [300n, E("0.08")],
        [600n, E("0.06")],
        [900n, E("0.04")],
        [1200n, RESERVE_PRICE],
        [1500n, RESERVE_PRICE],
      ];

      expect(await f.auction.currentPrice()).to.equal(START_PRICE);
      for (const [t, expected] of checkpoints) {
        await time.increaseTo(f.startTime + t);
        expect(await f.auction.currentPrice()).to.equal(expected);
      }
    });

    it("never increases and never drops below the reserve price", async function () {
      const f = await loadFixture(startedFixture);
      let previous = await f.auction.currentPrice();

      for (let t = 97n; t <= DURATION + 100n; t += 97n) {
        await time.increaseTo(f.startTime + t);
        const price = await f.auction.currentPrice();
        expect(price).to.be.at.most(previous);
        expect(price).to.be.at.least(RESERVE_PRICE);
        previous = price;
      }
    });
  });

  describe("Bidding and clearing", function () {
    it("records committed ETH without fixing a per-bid price", async function () {
      const f = await loadFixture(startedFixture);

      await expect(bidAt(f, f.alice, 300, E("20")))
        .to.emit(f.auction, "BidPlaced")
        .withArgs(f.alice.address, E("20"), 0, E("0.08"));
      await bidAt(f, f.alice, 400, E("10"));

      expect(await f.auction.commitments(f.alice.address)).to.equal(E("30"));
      expect(await f.auction.tokensOf(f.alice.address)).to.equal(0);
      expect(await f.auction.totalCommitted()).to.equal(E("30"));
      expect(await ethers.provider.getBalance(await f.auction.getAddress())).to.equal(E("30"));
    });

    it("rejects zero bids and bids after the window closes", async function () {
      const f = await loadFixture(startedFixture);

      await expect(bidAt(f, f.alice, 10, 0)).to.be.revertedWith("Zero bid");
      await expect(bidAt(f, f.alice, Number(DURATION), E("1"))).to.be.revertedWith("Auction not active");
    });

    it("clears the moment committed capital meets total supply (brief: uniform clearing price)", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 300, E("48"));

      // 48 ETH buys 1,000 NTU once the price reaches 0.048 ETH, at t = 780 s
      await time.increaseTo(f.startTime + 779n);
      expect(await f.auction.soldOut()).to.equal(false);
      await time.increaseTo(f.startTime + 780n);
      expect(await f.auction.soldOut()).to.equal(true);
      await expect(bidAt(f, f.bob, 781, E("1"))).to.be.revertedWith("Auction not active");

      await expect(f.auction.finalize())
        .to.emit(f.auction, "AuctionFinalized")
        .withArgs(E("0.048"), TOTAL_SUPPLY, 0);
      expect(await f.auction.tokensOf(f.alice.address)).to.equal(TOTAL_SUPPLY);
    });

    it("caps a bid that bridges the threshold and refunds its surplus in the same transaction", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 300, E("48"));

      // At t = 600 s the whole supply costs 60 ETH, so only 12 of Bob's 25 ETH fit
      const tx = bidAt(f, f.bob, 600, E("25"));
      await expect(tx).to.changeEtherBalances([f.bob, f.auction], [E("-12"), E("12")]);
      await expect(tx).to.emit(f.auction, "BidPlaced").withArgs(f.bob.address, E("12"), E("13"), E("0.06"));
      await expect(tx).to.emit(f.auction, "AuctionFinalized").withArgs(E("0.06"), TOTAL_SUPPLY, 0);

      expect(await f.auction.finalized()).to.equal(true);
      expect(await f.auction.commitments(f.bob.address)).to.equal(E("12"));
    });

    it("charges every winning bidder the same clearing price", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 300, E("48"));
      await bidAt(f, f.bob, 600, E("25"));
      const clearingPrice = await f.auction.clearingPrice();

      await expect(f.auction.connect(f.alice).claim()).to.changeTokenBalance(f.token, f.alice, E("800"));
      await expect(f.auction.connect(f.bob).claim()).to.changeTokenBalance(f.token, f.bob, E("200"));

      for (const bidder of [f.alice, f.bob]) {
        const paid = await f.auction.commitments(bidder.address);
        const received = await f.token.balanceOf(bidder.address);
        expect((received * clearingPrice) / E("1")).to.equal(paid);
      }
    });

    it("sells out on committed capital where per-bid allocation would settle at the reserve", async function () {
      // Same bids as the 2026-10-28 branch comparison, scaled to these prices. Fixing each bid's tokens
      // at its own price (dutch-auction-token-launch) never fills here: it expires at 0.02 ETH, burns
      // 166.67 NTU and pays the seller 16.67 ETH.
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 300, E("40"));
      await expect(bidAt(f, f.bob, 600, E("20")))
        .to.emit(f.auction, "AuctionFinalized")
        .withArgs(E("0.06"), TOTAL_SUPPLY, 0);

      await expect(f.auction.connect(f.alice).claim()).to.changeTokenBalance(f.token, f.alice, 666666666666666666666n);
      await expect(f.auction.connect(f.bob).claim()).to.changeTokenBalance(f.token, f.bob, 333333333333333333333n);
      await expect(f.auction.withdrawProceeds()).to.changeEtherBalance(f.seller, E("60"));
      expect(await f.token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });
  });

  describe("Expiry and burning", function () {
    it("settles at the reserve price and burns unsold tokens from totalSupply", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 600, E("5"));

      await expect(f.auction.finalize()).to.be.revertedWith("Auction still active");
      await time.increaseTo(f.startTime + DURATION);
      expect(await f.auction.isActive()).to.equal(false);

      await expect(f.auction.finalize())
        .to.emit(f.auction, "AuctionFinalized")
        .withArgs(RESERVE_PRICE, E("250"), E("750"));
      expect(await f.token.totalSupply()).to.equal(E("250"));
      expect(await f.token.balanceOf(await f.auction.getAddress())).to.equal(E("250"));
      await expect(f.auction.finalize()).to.be.revertedWith("Already finalized");
    });

    it("burns the whole supply when nobody bids", async function () {
      const f = await loadFixture(startedFixture);
      await time.increaseTo(f.startTime + DURATION);

      await f.auction.finalize();
      expect(await f.token.totalSupply()).to.equal(0);
      expect(await f.auction.tokensOf(f.alice.address)).to.equal(0);
      await expect(f.auction.withdrawProceeds()).to.changeEtherBalance(f.seller, 0);
    });
  });

  describe("Claims", function () {
    it("finalizes automatically on the first claim after expiry", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 600, E("5"));
      await time.increaseTo(f.startTime + DURATION);

      const tx = f.auction.connect(f.alice).claim();
      await expect(tx).to.emit(f.auction, "AuctionFinalized").withArgs(RESERVE_PRICE, E("250"), E("750"));
      await expect(tx).to.emit(f.auction, "TokensClaimed").withArgs(f.alice.address, E("250"));
    });

    it("rejects early, repeated and empty claims", async function () {
      const f = await loadFixture(deployFixture);
      await expect(f.auction.connect(f.alice).claim()).to.be.revertedWith("Auction still active");

      const s = await loadFixture(startedFixture);
      await bidAt(s, s.alice, 300, E("10"));
      await expect(s.auction.connect(s.alice).claim()).to.be.revertedWith("Auction still active");

      await time.increaseTo(s.startTime + DURATION);
      await s.auction.connect(s.alice).claim();
      await expect(s.auction.connect(s.alice).claim()).to.be.revertedWith("Already claimed");
      await expect(s.auction.connect(s.bob).claim()).to.be.revertedWith("Nothing to claim");
    });

    it("never pays out more than tokensSold when the clearing price rounds down", async function () {
      const f = await loadFixture(startedFixture);
      const bids = [
        [f.alice, 100, E("13.333333333333333333")],
        [f.bob, 200, E("17.777777777777777777")],
        [f.charlie, 250, E("16.999999999999999999")],
      ];
      for (const [bidder, t, value] of bids) {
        await bidAt(f, bidder, t, value);
      }

      // Sells out by the clock (no bridging bid), so clearingPrice = floor(totalCommitted / supply) rounds
      await time.increaseTo(f.startTime + 900n);
      await f.auction.finalize();
      const tokensSold = await f.auction.tokensSold();
      expect(tokensSold).to.equal(TOTAL_SUPPLY);

      let claimedTotal = 0n;
      for (const [bidder] of bids) {
        await f.auction.connect(bidder).claim();
        claimedTotal += await f.token.balanceOf(bidder.address);
      }
      expect(claimedTotal).to.be.at.most(tokensSold);
      expect(tokensSold - claimedTotal).to.be.lessThan(BigInt(bids.length));
    });
  });

  describe("Seller proceeds", function () {
    it("pays the seller exactly the committed ETH, once, without touching bidders' tokens", async function () {
      const f = await loadFixture(startedFixture);
      await bidAt(f, f.alice, 300, E("48"));

      await expect(f.auction.withdrawProceeds()).to.be.revertedWith("Auction not finalized");
      await bidAt(f, f.bob, 600, E("25"));

      await expect(f.auction.connect(f.alice).withdrawProceeds()).to.be.revertedWith("Only seller");
      await expect(f.auction.withdrawProceeds())
        .to.changeEtherBalances([f.seller, f.auction], [E("60"), E("-60")]);
      await expect(f.auction.withdrawProceeds()).to.be.revertedWith("Already withdrawn");

      // Regression for the v1 balance sweep: bidders can still claim after the seller withdraws
      await expect(f.auction.connect(f.alice).claim()).to.changeTokenBalance(f.token, f.alice, E("800"));
      await expect(f.auction.connect(f.bob).claim()).to.changeTokenBalance(f.token, f.bob, E("200"));
    });
  });

  describe("Security: reentrancy (bonus)", function () {
    async function attackerFixture() {
      const f = await startedFixture();
      const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await ReentrancyAttacker.deploy(await f.auction.getAddress());
      return { ...f, attacker };
    }

    it("blocks every re-entry from the refund callback and pays only the fair share", async function () {
      const f = await loadFixture(attackerFixture);
      await bidAt(f, f.alice, 300, E("48"));

      await time.setNextBlockTimestamp(f.startTime + 600n);
      const tx = f.attacker.connect(f.charlie).attackBid({ value: E("25") });
      await expect(tx).to.changeEtherBalances(
        [f.charlie, f.attacker, f.auction],
        [E("-25"), E("13"), E("12")]
      );

      expect(await f.attacker.reentryAttempts()).to.equal(1);
      expect(await f.attacker.reentrySuccesses()).to.equal(0);
      expect(await f.auction.totalCommitted()).to.equal(E("60"));

      await expect(f.attacker.claim()).to.changeTokenBalance(f.token, f.attacker, E("200"));
      await expect(f.attacker.claim()).to.be.revertedWith("Already claimed");
    });

    it("reverts the whole bid when a bidder rejects its refund, leaving state unchanged", async function () {
      const f = await loadFixture(attackerFixture);
      await bidAt(f, f.alice, 300, E("48"));
      await f.attacker.setRejectRefunds(true);

      await time.setNextBlockTimestamp(f.startTime + 600n);
      await expect(f.attacker.attackBid({ value: E("25") })).to.be.revertedWith("Refund failed");
      expect(await f.auction.totalCommitted()).to.equal(E("48"));
      expect(await f.auction.finalized()).to.equal(false);
    });
  });

  describe("Invariants (seeded random auctions)", function () {
    // Deterministic 64-bit LCG so failures are reproducible
    function makeRng(seed) {
      let state = BigInt(seed);
      return () => {
        state = (state * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
        return state >> 16n;
      };
    }

    for (let seed = 1; seed <= 10; seed++) {
      it(`holds all spec invariants for seed ${seed}`, async function () {
        const f = await loadFixture(startedFixture);
        const rand = makeRng(seed);
        const bidders = [f.alice, f.bob, f.charlie, ...f.others.slice(0, 5)];
        const auctionAddress = await f.auction.getAddress();

        let t = 0n;
        const bidCount = 3n + (rand() % 10n);
        for (let i = 0n; i < bidCount; i++) {
          t += 1n + (rand() % 150n);
          if (t >= DURATION) break;
          const bidder = bidders[Number(rand() % BigInt(bidders.length))];
          const value = E("0.1") + (rand() % E("30"));
          try {
            await bidAt(f, bidder, t, value);
          } catch (err) {
            expect(err.message).to.include("Auction not active");
          }
          expect(await ethers.provider.getBalance(auctionAddress)).to.equal(await f.auction.totalCommitted());
        }

        if (!(await f.auction.finalized())) {
          if (BigInt(await time.latest()) < f.startTime + DURATION) {
            await time.increaseTo(f.startTime + DURATION);
          }
          await f.auction.finalize();
        }

        const totalCommitted = await f.auction.totalCommitted();
        const clearingPrice = await f.auction.clearingPrice();
        const tokensSold = await f.auction.tokensSold();

        expect(clearingPrice).to.be.at.least(RESERVE_PRICE);
        expect(await f.token.totalSupply()).to.equal(tokensSold);
        expect(await f.token.balanceOf(auctionAddress)).to.equal(tokensSold);
        expect(await ethers.provider.getBalance(auctionAddress)).to.equal(totalCommitted);

        let claimedTotal = 0n;
        let winners = 0n;
        for (const bidder of bidders) {
          const paid = await f.auction.commitments(bidder.address);
          if (paid === 0n) continue;
          winners++;
          await f.auction.connect(bidder).claim();
          const received = await f.token.balanceOf(bidder.address);
          claimedTotal += received;

          // Uniform price: cost at the clearing price matches what was paid, rounding only in the contract's favour
          const cost = (received * clearingPrice) / E("1");
          expect(cost).to.be.at.most(paid);
          expect(paid - cost).to.be.lessThan(10_000n);
        }

        expect(claimedTotal).to.be.at.most(tokensSold);
        expect(tokensSold - claimedTotal).to.be.lessThan(winners + 1n);

        await expect(f.auction.withdrawProceeds()).to.changeEtherBalance(f.seller, totalCommitted);
        expect(await ethers.provider.getBalance(auctionAddress)).to.equal(0);
      });
    }
  });
});
