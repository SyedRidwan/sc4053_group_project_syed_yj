import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

describe("DutchAuction - Bidding", function () {

  async function deployFixture() {
    const {
      viem,
      networkHelpers,
    } = await network.create();

    const [
      deployer,
      alice,
      bob,
      charlie,
    ] = await viem.getWalletClients();

    // ---------------------------------
    // Deploy Hortons (TIM)
    // ---------------------------------

    const tokenDeployed = await viem.deployContract(
      "AuctionToken",
      [1000n]
    );

    // ---------------------------------
    // Auction parameters
    // ---------------------------------

    const startPrice = parseEther("1");
    const reservePrice = parseEther("0.2");
    const tokensForSale = parseEther("1000");

    // ---------------------------------
    // Deploy DutchAuction
    // ---------------------------------

    const auctionDeployed = await viem.deployContract(
      "DutchAuction",
      [
        tokenDeployed.address,
        startPrice,
        reservePrice,
        tokensForSale,
      ]
    );

    // ---------------------------------
    // Writable token instance
    // ---------------------------------

    const token = await viem.getContractAt(
      "AuctionToken",
      tokenDeployed.address,
      {
        client: {
          wallet: deployer,
        },
      }
    );

    // ---------------------------------
    // Read/deployer auction instance
    // ---------------------------------

    const auction = await viem.getContractAt(
      "DutchAuction",
      auctionDeployed.address,
      {
        client: {
          wallet: deployer,
        },
      }
    );

    // ---------------------------------
    // Alice auction instance
    // ---------------------------------

    const aliceAuction = await viem.getContractAt(
      "DutchAuction",
      auctionDeployed.address,
      {
        client: {
          wallet: alice,
        },
      }
    );

    // ---------------------------------
    // Bob auction instance
    // ---------------------------------

    const bobAuction = await viem.getContractAt(
      "DutchAuction",
      auctionDeployed.address,
      {
        client: {
          wallet: bob,
        },
      }
    );

    // ---------------------------------
    // Charlie auction instance
    // ---------------------------------

    const charlieAuction = await viem.getContractAt(
      "DutchAuction",
      auctionDeployed.address,
      {
        client: {
          wallet: charlie,
        },
      }
    );

    // ---------------------------------
    // Move 1000 TIM into auction escrow
    // ---------------------------------

    await token.write.transfer([
      auction.address,
      tokensForSale,
    ]);

    return {
      viem,
      networkHelpers,
      deployer,
      alice,
      bob,
      charlie,
      token,
      auction,
      aliceAuction,
      bobAuction,
      charlieAuction,
    };
  }


  // ============================================================
  // TEST 1
  // Basic bid
  // ============================================================

  it(
    "should accept ETH and allocate TIM to Alice",
    async function () {

      const {
        auction,
        alice,
        aliceAuction,
      } = await deployFixture();

      await aliceAuction.write.bid([], {
        value: parseEther("10"),
      });

      const aliceBid =
        await auction.read.bids([
          alice.account.address,
        ]);

      console.log(
        "Alice ETH committed:",
        formatEther(aliceBid[0])
      );

      console.log(
        "Alice TIM allocated:",
        formatEther(aliceBid[1])
      );

      assert.equal(
        aliceBid[0],
        parseEther("10")
      );

      assert.ok(
        aliceBid[1] > 0n
      );
    }
  );


  // ============================================================
  // TEST 2
  // Total allocation increases
  // ============================================================

  it(
    "should increase total token allocation",
    async function () {

      const {
        auction,
        aliceAuction,
      } = await deployFixture();

      await aliceAuction.write.bid([], {
        value: parseEther("10"),
      });

      const allocated =
        await auction.read.totalTokensAllocated();

      console.log(
        "Total TIM allocated:",
        formatEther(allocated)
      );

      assert.ok(
        allocated > 0n
      );
    }
  );


  // ============================================================
  // TEST 3
  // Multiple bidders
  // ============================================================

  it(
    "should allow multiple bidders",
    async function () {

      const {
        auction,
        alice,
        bob,
        aliceAuction,
        bobAuction,
      } = await deployFixture();

      await aliceAuction.write.bid([], {
        value: parseEther("10"),
      });

      await bobAuction.write.bid([], {
        value: parseEther("20"),
      });

      const aliceBid =
        await auction.read.bids([
          alice.account.address,
        ]);

      const bobBid =
        await auction.read.bids([
          bob.account.address,
        ]);

      console.log(
        "Alice TIM:",
        formatEther(aliceBid[1])
      );

      console.log(
        "Bob TIM:",
        formatEther(bobBid[1])
      );

      assert.ok(
        aliceBid[1] > 0n
      );

      assert.ok(
        bobBid[1] > 0n
      );
    }
  );


  // ============================================================
  // TEST 4
  // ETH actually stays inside auction
  // ============================================================

  it(
    "should hold Alice's ETH inside the auction",
    async function () {

      const {
        viem,
        auction,
        aliceAuction,
      } = await deployFixture();

      await aliceAuction.write.bid([], {
        value: parseEther("10"),
      });

      const publicClient =
        await viem.getPublicClient();

      const balance =
        await publicClient.getBalance({
          address: auction.address,
        });

      console.log(
        "Auction ETH balance:",
        formatEther(balance)
      );

      assert.equal(
        balance,
        parseEther("10")
      );
    }
  );


  // ============================================================
  // TEST 5
  // Exact bidding-time allocation
  // ============================================================

  it(
    "should allocate TIM based on the exact price at each bidding time",
    async function () {

      const {
        auction,
        alice,
        bob,
        charlie,
        aliceAuction,
        bobAuction,
        charlieAuction,
        networkHelpers,
      } = await deployFixture();

      const startTime =
        await auction.read.startTime();


      // ----------------------------------------------------------
      // Alice: exactly 5 minutes
      //
      // Price = 0.8 ETH / TIM
      // 8 ETH / 0.8 = 10 TIM
      // ----------------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 300n
      );

      await aliceAuction.write.bid([], {
        value: parseEther("8"),
      });

      const aliceBid =
        await auction.read.bids([
          alice.account.address,
        ]);

      console.log(
        "Alice TIM at 5 min:",
        formatEther(aliceBid[1])
      );

      assert.equal(
        aliceBid[0],
        parseEther("8")
      );

      assert.equal(
        aliceBid[1],
        parseEther("10")
      );


      // ----------------------------------------------------------
      // Bob: exactly 10 minutes
      //
      // Price = 0.6 ETH / TIM
      // 12 ETH / 0.6 = 20 TIM
      // ----------------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 600n
      );

      await bobAuction.write.bid([], {
        value: parseEther("12"),
      });

      const bobBid =
        await auction.read.bids([
          bob.account.address,
        ]);

      console.log(
        "Bob TIM at 10 min:",
        formatEther(bobBid[1])
      );

      assert.equal(
        bobBid[0],
        parseEther("12")
      );

      assert.equal(
        bobBid[1],
        parseEther("20")
      );


      // ----------------------------------------------------------
      // Charlie: exactly 15 minutes
      //
      // Price = 0.4 ETH / TIM
      // 20 ETH / 0.4 = 50 TIM
      // ----------------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 900n
      );

      await charlieAuction.write.bid([], {
        value: parseEther("20"),
      });

      const charlieBid =
        await auction.read.bids([
          charlie.account.address,
        ]);

      console.log(
        "Charlie TIM at 15 min:",
        formatEther(charlieBid[1])
      );

      assert.equal(
        charlieBid[0],
        parseEther("20")
      );

      assert.equal(
        charlieBid[1],
        parseEther("50")
      );


      // ----------------------------------------------------------
      // Total:
      //
      // Alice   10
      // Bob     20
      // Charlie 50
      //
      // = 80 TIM
      // ----------------------------------------------------------

      const totalAllocated =
        await auction.read.totalTokensAllocated();

      console.log(
        "Total TIM allocated:",
        formatEther(totalAllocated)
      );

      assert.equal(
        totalAllocated,
        parseEther("80")
      );
    }
  );

});