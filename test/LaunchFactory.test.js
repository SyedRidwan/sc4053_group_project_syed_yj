const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const { time, setBalance } = require("@nomicfoundation/hardhat-network-helpers");

const E = ethers.parseEther;
const SUPPLY = E("1000");
const START = E("0.1");
const RESERVE = E("0.02");

describe("LaunchFactory", function () {
  let seller1, seller2, alice, bob, curator, mallory, factory;

  async function createLaunch(signer, p = {}) {
    const tx = await factory
      .connect(signer)
      .createLaunch(p.name ?? "Coin", p.symbol ?? "CN", p.supply ?? SUPPLY, p.start ?? START, p.reserve ?? RESERVE);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "LaunchCreated");
    return {
      id: event.args.id,
      token: await ethers.getContractAt("HortonsToken", event.args.token),
      auction: await ethers.getContractAt("DutchAuction", event.args.auction),
    };
  }

  // Every field of an auction, so a test can prove another auction's activity changed nothing
  async function snapshot(launch, addresses = []) {
    const { auction, token } = launch;
    const state = {
      eth: await ethers.provider.getBalance(await auction.getAddress()),
      held: await token.balanceOf(await auction.getAddress()),
      supply: await token.totalSupply(),
      committed: await auction.totalCommitted(),
      clearing: await auction.clearingPrice(),
      sold: await auction.tokensSold(),
      finalized: await auction.finalized(),
      withdrawn: await auction.proceedsWithdrawn(),
    };
    for (const address of addresses) {
      state[`commitment:${address}`] = await auction.commitments(address);
      state[`balance:${address}`] = await token.balanceOf(address);
    }
    return JSON.stringify(state, (_, value) => (typeof value === "bigint" ? value.toString() : value));
  }

  beforeEach(async function () {
    [, seller1, seller2, alice, bob, curator, mallory] = await ethers.getSigners();
    factory = await ethers.deployContract("LaunchFactory", [curator.address]);
  });

  describe("createLaunch", function () {
    it("moves the whole supply into a running auction and leaves the factory with nothing", async function () {
      const launch = await createLaunch(seller1, { name: "Alpha", symbol: "ALP" });
      const auctionAddress = await launch.auction.getAddress();
      const factoryAddress = await factory.getAddress();

      expect(await launch.token.name()).to.equal("Alpha");
      expect(await launch.token.symbol()).to.equal("ALP");
      expect(await launch.token.balanceOf(auctionAddress)).to.equal(SUPPLY);
      expect(await launch.token.totalSupply()).to.equal(SUPPLY);
      expect(await launch.token.balanceOf(factoryAddress)).to.equal(0);
      expect(await launch.token.balanceOf(seller1.address)).to.equal(0);
      expect(await launch.token.allowance(factoryAddress, auctionAddress)).to.equal(0);
      expect(await launch.auction.isActive()).to.equal(true);

      const record = await factory.launchAt(launch.id);
      expect(record.seller).to.equal(seller1.address);
      expect(record.createdBlock).to.equal(await ethers.provider.getBlockNumber());
    });

    it("runs the same contract code as a directly deployed auction and token", async function () {
      const launch = await createLaunch(seller1);
      const token = await launch.token.getAddress();
      const direct = await ethers.deployContract("DutchAuction", [token, SUPPLY, START, RESERVE]);
      const directToken = await ethers.deployContract("HortonsToken", ["Coin", "CN", SUPPLY]);
      const [deployer] = await ethers.getSigners();

      // The only immutable that differs is the on-chain seller
      const masked = async (contract, seller) =>
        (await ethers.provider.getCode(await contract.getAddress()))
          .toLowerCase()
          .replaceAll(seller.slice(2).toLowerCase(), "0".repeat(40));
      expect(await masked(launch.auction, await factory.getAddress())).to.equal(await masked(direct, deployer.address));
      expect(await ethers.provider.getCode(token)).to.equal(await ethers.provider.getCode(await directToken.getAddress()));
    });

    it("emits LaunchCreated with the seller, token and auction", async function () {
      const tx = await factory.connect(seller1).createLaunch("A", "A", SUPPLY, START, RESERVE);
      const record = await factory.launchAt(0);
      await expect(tx).to.emit(factory, "LaunchCreated").withArgs(0, seller1.address, record.token, record.auction);
      expect(await factory.launchCount()).to.equal(1);
    });
  });

  describe("Parameter bounds", function () {
    const cases = [
      ["an empty name", { name: "" }, "Invalid name"],
      ["a name over 32 bytes", { name: "x".repeat(33) }, "Invalid name"],
      ["an empty symbol", { symbol: "" }, "Invalid symbol"],
      ["a symbol over 11 bytes", { symbol: "x".repeat(12) }, "Invalid symbol"],
      ["zero supply", { supply: 0n }, "Supply out of range"],
      ["a supply under 1 token", { supply: E("1") - 1n }, "Supply out of range"],
      ["a huge supply", { supply: ethers.MaxUint256 }, "Supply out of range"],
      ["a zero reserve", { reserve: 0n }, "Reserve too low"],
      ["a reserve under 1 gwei", { reserve: 10n ** 9n - 1n }, "Reserve too low"],
      ["a start price over the cap", { start: E("1000") + 1n }, "Price too high"],
      ["a start equal to the reserve", { reserve: START }, "Start must be at least 2x reserve"],
      ["a nearly flat price curve", { start: 2n * RESERVE - 1n }, "Start must be at least 2x reserve"],
      ["a raise under 0.001 ETH", { supply: E("1"), start: E("0.002"), reserve: E("0.001") - 1n }, "Raise too small"],
    ];
    for (const [label, params, message] of cases) {
      it(`rejects ${label}`, async function () {
        await expect(createLaunch(seller1, params)).to.be.revertedWith(message);
        expect(await factory.launchCount()).to.equal(0);
      });
    }

    it("accepts the extremes of the allowed range, with the price maths intact", async function () {
      const big = await createLaunch(seller1, { supply: await factory.MAX_SUPPLY(), start: await factory.MAX_PRICE(), reserve: E("500") });
      const small = await createLaunch(seller1, { supply: E("1000000"), start: 2n * 10n ** 9n, reserve: 10n ** 9n });
      const cheapest = await createLaunch(seller1, { supply: E("1"), start: E("0.002"), reserve: E("0.001") });
      await time.increaseTo((await big.auction.endTime()) - 2n); // Created first, so it ends first
      for (const launch of [big, small, cheapest]) {
        expect(await launch.auction.isActive()).to.equal(true);
      }
    });
  });

  describe("Duration and curve", function () {
    it("gives every launch exactly 1200 seconds, and sellers have no duration or curve input", async function () {
      const inputs = factory.interface.getFunction("createLaunch").inputs.map((input) => input.name);
      expect(inputs).to.deep.equal(["name", "symbol", "supply", "startPrice", "reservePrice"]);
      for (const params of [{}, { supply: E("1"), start: E("1"), reserve: E("0.5") }, { supply: E("1000000"), start: E("1000"), reserve: E("1") }]) {
        const { auction } = await createLaunch(seller1, params);
        expect((await auction.endTime()) - (await auction.startTime())).to.equal(1200n);
      }
    });

    it("cannot be restarted or changed by the seller after creation", async function () {
      const { auction } = await createLaunch(seller1);
      await expect(auction.connect(seller1).start()).to.be.revertedWith("Only seller");
      const mutating = auction.interface.fragments
        .filter((fragment) => fragment.type === "function" && !["view", "pure"].includes(fragment.stateMutability))
        .map((fragment) => fragment.name)
        .sort();
      expect(mutating).to.deep.equal(["bid", "claim", "finalize", "start", "withdrawProceeds"]);
    });
  });

  describe("Isolation of concurrent auctions", function () {
    it("a full lifecycle on one launch changes nothing on another, and the reverse", async function () {
      const a = await createLaunch(seller1, { name: "Alpha", symbol: "ALP" });
      const b = await createLaunch(seller2, { name: "Beta", symbol: "BET", supply: E("500"), start: E("1"), reserve: E("0.5") });
      const who = [alice.address, bob.address, seller1.address, seller2.address];

      await b.auction.connect(bob).bid({ value: E("5") });
      const bBefore = await snapshot(b, who);

      await a.auction.connect(alice).bid({ value: E("60") });
      await a.auction.connect(bob).bid({ value: E("60") });
      expect(await a.auction.finalized()).to.equal(true);
      await a.auction.connect(alice).claim();
      await a.auction.connect(bob).claim();
      await factory.connect(seller1).withdrawProceeds(a.id);
      expect(await snapshot(b, who)).to.equal(bBefore);

      await expect(b.auction.connect(alice).claim()).to.be.revertedWith("Auction still active");
      const aBefore = await snapshot(a, who);

      await time.increaseTo((await b.auction.endTime()) + 1n);
      await b.auction.finalize();
      await b.auction.connect(bob).claim();
      await expect(b.auction.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
      await factory.connect(seller2).withdrawProceeds(b.id);
      expect(await snapshot(a, who)).to.equal(aBefore);

      for (const contract of [a.auction, b.auction, factory]) {
        expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0);
      }
    });

    it("burns and totalSupply move independently per launch", async function () {
      const a = await createLaunch(seller1, { symbol: "A" });
      const b = await createLaunch(seller2, { symbol: "B" });
      await a.auction.connect(alice).bid({ value: E("5") }); // Buys 250 at reserve, burns 750
      await b.auction.connect(alice).bid({ value: E("10") }); // Buys 500 at reserve, burns 500
      await time.increaseTo((await b.auction.endTime()) + 1n);

      await a.auction.finalize();
      expect(await a.token.totalSupply()).to.equal(E("250"));
      expect(await b.token.totalSupply()).to.equal(SUPPLY);

      await b.auction.finalize();
      expect(await b.token.totalSupply()).to.equal(E("500"));
      expect(await a.token.totalSupply()).to.equal(E("250"));
    });

    it("pays one seller's two launches exactly their own amounts", async function () {
      const a = await createLaunch(seller1, { symbol: "A" });
      const b = await createLaunch(seller1, { symbol: "B", supply: E("10") });
      await b.auction.connect(alice).bid({ value: E("0.5") });
      await a.auction.connect(alice).bid({ value: E("3") });
      await time.increaseTo((await a.auction.endTime()) + 1n);
      await a.auction.finalize();
      await b.auction.finalize();
      await expect(factory.connect(seller1).withdrawProceeds(a.id)).to.changeEtherBalance(seller1, E("3"));
      await expect(factory.connect(seller1).withdrawProceeds(b.id)).to.changeEtherBalance(seller1, await b.auction.totalCommitted());
    });
  });

  describe("Withdrawing proceeds", function () {
    it("pays only the registered seller, once, and emits ProceedsForwarded", async function () {
      const a = await createLaunch(seller1, { symbol: "A" });
      const b = await createLaunch(seller2, { symbol: "B" });
      await a.auction.connect(alice).bid({ value: E("120") });
      await b.auction.connect(alice).bid({ value: E("120") });
      const paid = await a.auction.totalCommitted();

      await expect(a.auction.connect(seller1).withdrawProceeds()).to.be.revertedWith("Only seller");
      await expect(factory.connect(seller2).withdrawProceeds(a.id)).to.be.revertedWith("Only launch seller");
      await expect(factory.connect(mallory).withdrawProceeds(a.id)).to.be.revertedWith("Only launch seller");
      await expect(factory.connect(seller1).withdrawProceeds(999)).to.be.reverted;

      const tx = factory.connect(seller1).withdrawProceeds(a.id);
      await expect(tx).to.changeEtherBalances([seller1, seller2, a.auction, b.auction, factory], [paid, 0, -paid, 0, 0]);
      await expect(tx).to.emit(factory, "ProceedsForwarded").withArgs(a.id, seller1.address, paid);
      await expect(factory.connect(seller1).withdrawProceeds(a.id)).to.be.revertedWith("Already withdrawn");
    });

    it("cannot withdraw before the auction settles", async function () {
      const { id, auction } = await createLaunch(seller1);
      await auction.connect(alice).bid({ value: E("1") });
      await expect(factory.connect(seller1).withdrawProceeds(id)).to.be.revertedWith("Auction not finalized");
    });

    it("rejects plain ETH from anyone but its own auctions", async function () {
      await expect(mallory.sendTransaction({ to: await factory.getAddress(), value: 1 })).to.be.revertedWith("Unknown sender");
    });

    it("never pays out ETH forced into the factory or an auction", async function () {
      const a = await createLaunch(seller1, { symbol: "A" });
      const b = await createLaunch(seller2, { symbol: "B" });
      await a.auction.connect(alice).bid({ value: E("120") });
      await ethers.deployContract("ForceSend", [await a.auction.getAddress()], { value: E("7") });
      await ethers.deployContract("ForceSend", [await factory.getAddress()], { value: E("5") });

      const paid = await a.auction.totalCommitted();
      await expect(factory.connect(seller1).withdrawProceeds(a.id)).to.changeEtherBalance(seller1, paid);
      expect(await ethers.provider.getBalance(await a.auction.getAddress())).to.equal(E("7"));
      expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(E("5"));
      expect(await ethers.provider.getBalance(await b.auction.getAddress())).to.equal(0);
    });
  });

  describe("Reentrancy", function () {
    async function launchAsContractSeller() {
      const evil = await ethers.deployContract("ReentrantSeller", [], mallory);
      await evil.exec(
        await factory.getAddress(),
        factory.interface.encodeFunctionData("createLaunch", ["Evil", "EVL", SUPPLY, START, RESERVE])
      );
      const record = await factory.launchAt(0);
      return { evil, auction: await ethers.getContractAt("DutchAuction", record.auction), record };
    }

    it("the refund attacker gets no successful re-entry on a factory launch", async function () {
      const { auction, token } = await createLaunch(seller1);
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await auction.getAddress()]);
      const startTime = await auction.startTime();
      await time.setNextBlockTimestamp(startTime + 300n);
      await auction.connect(alice).bid({ value: E("48") });
      await time.setNextBlockTimestamp(startTime + 600n);
      await expect(attacker.connect(bob).attackBid({ value: E("25") })).to.changeEtherBalances(
        [bob, attacker, auction],
        [E("-25"), E("13"), E("12")]
      );
      expect(await attacker.reentryAttempts()).to.equal(1);
      expect(await attacker.reentrySuccesses()).to.equal(0);
      await attacker.claim();
      expect(await token.balanceOf(await attacker.getAddress())).to.equal(E("200"));
    });

    it("a reentrant seller collects once and cannot reach a neighbour's ETH", async function () {
      const { evil, auction } = await launchAsContractSeller();
      const victim = await createLaunch(seller2, { symbol: "VIC" });
      await auction.connect(alice).bid({ value: E("120") });
      await victim.auction.connect(alice).bid({ value: E("120") });

      const call = [await factory.getAddress(), factory.interface.encodeFunctionData("withdrawProceeds", [0])];
      await evil.setReplay(...call);
      await evil.exec(...call);

      expect(await evil.attempts()).to.equal(1);
      expect(await evil.successes()).to.equal(0);
      expect(await evil.received()).to.equal(await auction.totalCommitted());
      expect(await victim.auction.proceedsWithdrawn()).to.equal(false);
      expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(0);
    });

    it("a seller cannot re-enter the factory to withdraw a second launch mid-withdrawal", async function () {
      const { evil, auction } = await launchAsContractSeller();
      await evil.exec(
        await factory.getAddress(),
        factory.interface.encodeFunctionData("createLaunch", ["Evil 2", "EV2", SUPPLY, START, RESERVE])
      );
      const second = await ethers.getContractAt("DutchAuction", (await factory.launchAt(1)).auction);
      await auction.connect(alice).bid({ value: E("120") });
      await second.connect(alice).bid({ value: E("120") });

      const factoryAddress = await factory.getAddress();
      await evil.setReplay(factoryAddress, factory.interface.encodeFunctionData("withdrawProceeds", [1]));
      await evil.exec(factoryAddress, factory.interface.encodeFunctionData("withdrawProceeds", [0]));

      expect(await evil.attempts()).to.equal(1);
      expect(await evil.successes()).to.equal(0);
      expect(await second.proceedsWithdrawn()).to.equal(false);
    });

    it("a seller that rejects ETH blocks only its own withdrawal", async function () {
      const { evil, auction, record } = await launchAsContractSeller();
      await auction.connect(alice).bid({ value: E("120") });
      await evil.setRejecting(true);
      const call = [await factory.getAddress(), factory.interface.encodeFunctionData("withdrawProceeds", [0])];
      await expect(evil.exec(...call)).to.be.revertedWith("Forward failed");
      await auction.connect(alice).claim();
      const token = await ethers.getContractAt("HortonsToken", record.token);
      expect(await token.balanceOf(alice.address)).to.equal(SUPPLY);
    });
  });

  describe("Gas limit for bids", function () {
    const BID_GAS_LIMIT = 200_000n; // frontend/src/lib/auction.ts

    // The price falls while a wallet waits for its owner, so a plain bid can reach the chain as a sell-out
    async function bidEstimatedBeforeTheSellOut() {
      const { auction } = await createLaunch(seller1);
      await auction.connect(alice).bid({ value: E("10") });
      const room = (SUPPLY * (await auction.currentPrice())) / E("1") - (await auction.totalCommitted());
      const value = room - E("0.5");
      const estimate = await auction.connect(bob).bid.estimateGas({ value });
      await time.increase(30);
      return { auction, value, estimate };
    }

    it("a bid estimated as a plain bid runs out of gas on the sell-out path, even at twice the estimate", async function () {
      const { auction, value, estimate } = await bidEstimatedBeforeTheSellOut();
      await expect(auction.connect(bob).bid({ value, gasLimit: estimate * 2n })).to.be.reverted;
      expect(await auction.finalized()).to.equal(false);
    });

    it("the site's fixed limit covers that bid, and the surplus still comes back", async function () {
      const { auction, value } = await bidEstimatedBeforeTheSellOut();
      const receipt = await (await auction.connect(bob).bid({ value, gasLimit: BID_GAS_LIMIT })).wait();
      expect(receipt.gasUsed).to.be.lessThan(BID_GAS_LIMIT);
      expect(await auction.finalized()).to.equal(true);
      expect(await auction.commitments(bob.address)).to.be.lessThan(value);
    });
  });

  describe("Listing views", function () {
    it("pages through 51 listings and clamps the page size to 50", async function () {
      this.timeout(120000);
      for (let i = 0; i < 51; i++) {
        await createLaunch(i % 2 ? seller1 : seller2, { name: `Coin ${i}`, symbol: `C${i}` });
      }
      expect(await factory.launchCount()).to.equal(51);

      const seen = [];
      for (let offset = 0; ; ) {
        const page = await factory.getLaunches(offset, 20);
        if (page.length === 0) break;
        for (const row of page) {
          seen.push(Number(row.id));
          expect(row.name).to.equal(`Coin ${row.id}`);
          expect(row.symbol).to.equal(`C${row.id}`);
          expect(row.seller).to.equal(row.id % 2n ? seller1.address : seller2.address);
        }
        offset += page.length;
      }
      expect(seen).to.deep.equal([...Array(51).keys()]);

      expect(await factory.getLaunches(51, 20)).to.have.length(0);
      expect(await factory.getLaunches(0, 100000)).to.have.length(50);
      expect(await factory.getLaunches(0, 0)).to.have.length(0);
      expect(await factory.getLaunches(50, 20)).to.have.length(1);
    });

    it("reports a row's live state and an account's positions across listings", async function () {
      const a = await createLaunch(seller1, { symbol: "A" });
      const b = await createLaunch(seller2, { symbol: "B" });
      await a.auction.connect(alice).bid({ value: E("120") });
      await a.auction.connect(alice).claim();
      await b.auction.connect(alice).bid({ value: E("2") });

      const [rowA, rowB] = await factory.getLaunches(0, 2);
      expect(rowA.finalized).to.equal(true);
      expect(rowA.clearingPrice).to.equal(await a.auction.clearingPrice());
      expect(rowA.proceedsWithdrawn).to.equal(false);
      expect(rowB.finalized).to.equal(false);
      expect(rowB.totalCommitted).to.equal(E("2"));
      expect(rowB.currentPrice).to.be.lessThanOrEqual(START);

      const [posA, posB] = await factory.getPositions(alice.address, 0, 2);
      expect(posA.commitment).to.equal(await a.auction.totalCommitted());
      expect(posA.claimed).to.equal(true);
      expect(posA.tokenBalance).to.equal(await a.token.balanceOf(alice.address));
      expect(posB.commitment).to.equal(E("2"));
      expect(posB.tokensOwed).to.equal(0);
      expect(await factory.getPositions(alice.address, 2, 2)).to.have.length(0);
    });
  });

  describe("Curator", function () {
    async function liveLaunch() {
      const launch = await createLaunch(seller1);
      await launch.auction.connect(alice).bid({ value: E("10") });
      return launch;
    }

    it("is the only one who can hide or verify, and the role cannot be reassigned", async function () {
      const { id } = await liveLaunch();
      for (const signer of [seller1, alice, mallory]) {
        await expect(factory.connect(signer).setHidden(id, true)).to.be.revertedWith("Only curator");
        await expect(factory.connect(signer).setVerified(id, true)).to.be.revertedWith("Only curator");
      }
      await expect(factory.connect(curator).setHidden(id, true)).to.emit(factory, "LaunchHidden").withArgs(id, true);
      await expect(factory.connect(curator).setVerified(id, true)).to.emit(factory, "LaunchVerified").withArgs(id, true);
      const [row] = await factory.getLaunches(0, 1);
      expect(row.hidden).to.equal(true);
      expect(row.verified).to.equal(true);

      const mutating = factory.interface.fragments
        .filter((fragment) => fragment.type === "function" && !["view", "pure"].includes(fragment.stateMutability))
        .map((fragment) => fragment.format("sighash"))
        .sort();
      expect(mutating).to.deep.equal([
        "createLaunch(string,string,uint256,uint256,uint256)",
        "setHidden(uint256,bool)",
        "setVerified(uint256,bool)",
        "withdrawProceeds(uint256)",
      ]);
    });

    it("rejects a zero curator at deployment", async function () {
      await expect(ethers.deployContract("LaunchFactory", [ethers.ZeroAddress])).to.be.revertedWith("Invalid curator");
    });

    it("curator transactions make no external call and write only to the factory (execution trace)", async function () {
      const { id } = await liveLaunch();
      const factoryAddress = await factory.getAddress();
      for (const tx of [
        await factory.connect(curator).setHidden(id, true),
        await factory.connect(curator).setVerified(id, true),
        await factory.connect(curator).setHidden(id, false),
        await factory.connect(curator).setVerified(id, false),
      ]) {
        const receipt = await tx.wait();
        const trace = await hre.network.provider.send("debug_traceTransaction", [receipt.hash]);
        const ops = new Set(trace.structLogs.map((log) => log.op));
        for (const banned of ["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2", "SELFDESTRUCT"]) {
          expect(ops.has(banned), `${banned} seen`).to.equal(false);
        }
        expect(receipt.logs.every((log) => log.address === factoryAddress)).to.equal(true);
      }
    });

    it("cannot move funds or stop an auction by direct calls", async function () {
      const { id, auction, token } = await liveLaunch();
      await expect(auction.connect(curator).withdrawProceeds()).to.be.revertedWith("Only seller");
      await expect(factory.connect(curator).withdrawProceeds(id)).to.be.revertedWith("Only launch seller");
      await expect(auction.connect(curator).finalize()).to.be.revertedWith("Auction still active");
      await expect(token.connect(curator).transferFrom(await auction.getAddress(), curator.address, 1)).to.be.reverted;
      await expect(token.connect(curator).burnFrom(await auction.getAddress(), 1)).to.be.reverted;
      expect(await auction.isActive()).to.equal(true);
    });

    it("hiding is not a freeze: a hidden auction runs its whole lifecycle", async function () {
      const { id, auction } = await liveLaunch();
      await factory.connect(curator).setHidden(id, true);
      await auction.connect(bob).bid({ value: E("200") });
      expect(await auction.finalized()).to.equal(true);
      await auction.connect(alice).claim();
      await auction.connect(bob).claim();
      await factory.connect(seller1).withdrawProceeds(id);
      expect(await auction.proceedsWithdrawn()).to.equal(true);
    });
  });

  describe("Seeded random launches inside the bounds", function () {
    this.timeout(300000);

    function rng(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const pow10 = (x) => {
      const whole = Math.floor(x);
      return (10n ** BigInt(whole) * BigInt(Math.round(10 ** (x - whole) * 1000))) / 1000n;
    };

    // Reserves spread across the whole range, so very low prices get hit as often as high ones
    function randomParams(r) {
      for (;;) {
        const supply = pow10(18 + r() * 15);
        const reserve = pow10(9 + r() * 11.5);
        const start = reserve * 2n + pow10(9 + r() * 11.5);
        if (start <= E("1000") && (supply * reserve) / E("1") >= E("0.001")) return { supply, start, reserve };
      }
    }

    it("keeps spec section 4 across concurrent auctions", async function () {
      const signers = await ethers.getSigners();
      const bidders = signers.slice(7, 13);
      for (const bidder of bidders) await setBalance(bidder.address, 10n ** 45n);

      for (let seed = 1; seed <= 25; seed++) {
        const r = rng(seed * 7919);
        const launches = [];
        for (let i = 0; i < 3; i++) {
          const params = randomParams(r);
          const launch = await createLaunch(signers[1 + i], { ...params, name: `S${seed}L${i}`, symbol: `L${i}` });
          launches.push({ ...launch, params, seller: signers[1 + i], commits: new Map() });
        }
        const startTime = await launches[2].auction.startTime();

        let t = 1n;
        for (let k = 0; k < 12 && t < 1190n; k++) {
          t += BigInt(1 + Math.floor(r() * 100));
          const launch = launches[Math.floor(r() * 3)];
          const bidder = bidders[Math.floor(r() * bidders.length)];
          const room = (launch.params.supply * (await launch.auction.currentPrice())) / E("1");
          const value = r() < 0.2 ? BigInt(1 + Math.floor(r() * 1000)) : (room * BigInt(1 + Math.floor(r() * 1400))) / 1000n + 1n;
          const latest = BigInt((await ethers.provider.getBlock("latest")).timestamp);
          if (startTime + t <= latest) t = latest - startTime + 1n;
          await time.setNextBlockTimestamp(startTime + t);
          try {
            const receipt = await (await launch.auction.connect(bidder).bid({ value })).wait();
            const placed = receipt.logs
              .map((log) => {
                try {
                  return launch.auction.interface.parseLog(log);
                } catch {
                  return null;
                }
              })
              .find((parsed) => parsed && parsed.name === "BidPlaced");
            launch.commits.set(bidder.address, (launch.commits.get(bidder.address) ?? 0n) + placed.args.ethAccepted);
          } catch (err) {
            expect(err.message).to.match(/Auction not active/);
            await hre.network.provider.send("evm_mine");
          }
          for (const other of launches) {
            expect(await ethers.provider.getBalance(await other.auction.getAddress())).to.equal(await other.auction.totalCommitted());
          }
        }

        await time.increaseTo(startTime + 1300n);
        for (const launch of launches) {
          if (!(await launch.auction.finalized())) await launch.auction.finalize();
          const sold = await launch.auction.tokensSold();
          const clearing = await launch.auction.clearingPrice();

          expect(clearing >= launch.params.reserve).to.equal(true);
          expect(await launch.token.totalSupply()).to.equal(sold);
          expect(sold <= launch.params.supply).to.equal(true);

          let claimed = 0n;
          for (const [address, commit] of launch.commits) {
            const owed = await launch.auction.tokensOf(address);
            if (owed === 0n) continue;
            await launch.auction.connect(bidders.find((bidder) => bidder.address === address)).claim();
            claimed += owed;
            // Effective price matches the clearing price, except for bids too small to measure it
            if (owed >= 10n ** 6n) {
              const effective = (commit * E("1")) / owed;
              const gap = effective > clearing ? effective - clearing : clearing - effective;
              expect(gap * 1000n <= clearing, `seed ${seed}: paid ${effective} against ${clearing}`).to.equal(true);
            }
          }
          expect(claimed <= sold).to.equal(true);
          expect(sold - claimed <= BigInt(launch.commits.size)).to.equal(true); // Dust below 1 token-wei per bidder

          await factory.connect(launch.seller).withdrawProceeds(launch.id);
          expect(await ethers.provider.getBalance(await launch.auction.getAddress())).to.equal(0);
        }
        expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(0);
      }
    });
  });
});
