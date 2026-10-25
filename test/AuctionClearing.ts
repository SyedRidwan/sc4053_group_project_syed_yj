import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

import {
  parseEther,
  formatEther,
} from "viem";


describe("DutchAuction - Clearing and Partial Fill", function () {

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
      dave,
    ] = await viem.getWalletClients();


    // --------------------------------------------------
    // Deploy exactly 100 TIM
    // --------------------------------------------------

    const tokenDeployed =
      await viem.deployContract(
        "AuctionToken",
        [100n]
      );


    const startPrice =
      parseEther("1");

    const reservePrice =
      parseEther("0.2");

    const tokensForSale =
      parseEther("100");


    const auctionDeployed =
      await viem.deployContract(
        "DutchAuction",
        [
          tokenDeployed.address,
          startPrice,
          reservePrice,
          tokensForSale,
        ]
      );


    const token =
      await viem.getContractAt(
        "AuctionToken",
        tokenDeployed.address,
        {
          client: {
            wallet: deployer,
          },
        }
      );


    const auction =
      await viem.getContractAt(
        "DutchAuction",
        auctionDeployed.address,
        {
          client: {
            wallet: deployer,
          },
        }
      );


    const aliceAuction =
      await viem.getContractAt(
        "DutchAuction",
        auctionDeployed.address,
        {
          client: {
            wallet: alice,
          },
        }
      );


    const bobAuction =
      await viem.getContractAt(
        "DutchAuction",
        auctionDeployed.address,
        {
          client: {
            wallet: bob,
          },
        }
      );


    const charlieAuction =
      await viem.getContractAt(
        "DutchAuction",
        auctionDeployed.address,
        {
          client: {
            wallet: charlie,
          },
        }
      );


    const daveAuction =
      await viem.getContractAt(
        "DutchAuction",
        auctionDeployed.address,
        {
          client: {
            wallet: dave,
          },
        }
      );


    // Put all 100 TIM into auction escrow
    await token.write.transfer([
      auction.address,
      tokensForSale,
    ]);


    return {
      viem,
      networkHelpers,

      alice,
      bob,
      charlie,
      dave,

      token,
      auction,

      aliceAuction,
      bobAuction,
      charlieAuction,
      daveAuction,
    };
  }


  it(
    "should partially fill the final bid and set the clearing price",
    async function () {

      const {
        networkHelpers,

        alice,
        bob,
        charlie,
        dave,

        auction,

        aliceAuction,
        bobAuction,
        charlieAuction,
        daveAuction,
      } = await deployFixture();


      const startTime =
        await auction.read.startTime();


      // ==============================================
      // Alice
      // 5 min
      // Price = 0.8
      // 8 ETH -> 10 TIM
      // ==============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 300n
      );

      await aliceAuction.write.bid([], {
        value: parseEther("8"),
      });


      // ==============================================
      // Bob
      // 10 min
      // Price = 0.6
      // 12 ETH -> 20 TIM
      // ==============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 600n
      );

      await bobAuction.write.bid([], {
        value: parseEther("12"),
      });


      // ==============================================
      // Charlie
      // 15 min
      // Price = 0.4
      // 20 ETH -> 50 TIM
      //
      // Total so far = 80 TIM
      // ==============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 900n
      );

      await charlieAuction.write.bid([], {
        value: parseEther("20"),
      });


      let totalAllocated =
        await auction.read.totalTokensAllocated();


      console.log(
        "TIM allocated before Dave:",
        formatEther(totalAllocated)
      );


      assert.equal(
        totalAllocated,
        parseEther("80")
      );


      // ==============================================
      // Dave
      //
      // We want Dave to enter while price is still
      // above reserve.
      //
      // At 15 minutes the price is 0.4 ETH.
      //
      // Dave sends 20 ETH:
      //
      // Requested:
      // 20 / 0.4 = 50 TIM
      //
      // But only 20 TIM remain.
      //
      // Dave should receive only 20 TIM.
      // ==============================================

      //
      // Since another tx cannot use the exact same
      // timestamp on a normal advancing chain,
      // use 901 seconds.
      //

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 901n
      );


      const davePriceBeforeBid =
        await auction.read.getCurrentPrice();


      console.log(
        "Dave bid price:",
        formatEther(davePriceBeforeBid),
        "ETH/TIM"
      );


      await daveAuction.write.bid([], {
        value: parseEther("20"),
      });


      // ==============================================
      // Read Dave
      // ==============================================

      const daveBid =
        await auction.read.bids([
          dave.account.address
        ]);


      console.log(
        "Dave ETH committed:",
        formatEther(daveBid[0])
      );

      console.log(
        "Dave TIM allocated:",
        formatEther(daveBid[1])
      );


      // Dave sent all 20 ETH
      assert.equal(
        daveBid[0],
        parseEther("20")
      );


      // But there were only 20 TIM remaining
      assert.equal(
        daveBid[1],
        parseEther("20")
      );


      // ==============================================
      // Entire supply should now be allocated
      // ==============================================

      totalAllocated =
        await auction.read.totalTokensAllocated();


      console.log(
        "Final TIM allocated:",
        formatEther(totalAllocated)
      );


      assert.equal(
        totalAllocated,
        parseEther("100")
      );


      // ==============================================
      // Sold-out state
      // ==============================================

      const soldOut =
        await auction.read.soldOut();


      console.log(
        "Sold out:",
        soldOut
      );


      assert.equal(
        soldOut,
        true
      );


      // ==============================================
      // Clearing Price
      // ==============================================

      const clearingPrice =
        await auction.read.clearingPrice();

      console.log(
        "Clearing price:",
        formatEther(clearingPrice),
        "ETH/TIM"
      );


      // Dave's transaction was executed
      // exactly 901 seconds after auction start.

      const startPrice =
        parseEther("1");

      const reservePrice =
        parseEther("0.2");

      const elapsed =
        901n;

      const duration =
        1200n;

      const priceRange =
        startPrice - reservePrice;

      const discount =
        (priceRange * elapsed) / duration;

      const expectedClearingPrice =
        startPrice - discount;


      console.log(
        "Expected clearing price:",
        formatEther(expectedClearingPrice),
        "ETH/TIM"
      );


      assert.equal(
        clearingPrice,
        expectedClearingPrice
      );
          

          }
        );

});