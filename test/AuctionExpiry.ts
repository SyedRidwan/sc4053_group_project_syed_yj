import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  parseEther,
  formatEther,
} from "viem";

describe(
  "DutchAuction - Expiry and Unsold Burn",
  function () {

    async function deployFixture() {

      const {
        viem,
        networkHelpers,
      } = await network.create();

      const [
        deployer,
        alice,
        bob,
      ] = await viem.getWalletClients();


      // -----------------------------------------
      // Deploy 100 TIM
      // -----------------------------------------

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


      // Put all 100 TIM in auction escrow

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

        token,
        auction,
        aliceAuction,
        bobAuction,
      };
    }


    it(
      "should finalize at reserve price and burn unsold TIM after 20 minutes",
      async function () {

        const {
          networkHelpers,

          alice,
          bob,

          token,
          auction,
          aliceAuction,
          bobAuction,
        } = await deployFixture();


        const startTime =
          await auction.read.startTime();


        // ==========================================
        // Alice
        // t = 5 min
        // price = 0.8
        // 8 ETH -> 10 TIM
        // ==========================================

        await networkHelpers.time.setNextBlockTimestamp(
          startTime + 300n
        );

        await aliceAuction.write.bid([], {
          value: parseEther("8"),
        });


        // ==========================================
        // Bob
        // t = 10 min
        // price = 0.6
        // 12 ETH -> 20 TIM
        // ==========================================

        await networkHelpers.time.setNextBlockTimestamp(
          startTime + 600n
        );

        await bobAuction.write.bid([], {
          value: parseEther("12"),
        });


        // Total sold should be 30 TIM

        const allocatedBefore =
          await auction.read.totalTokensAllocated();

        console.log(
          "TIM sold before expiry:",
          formatEther(allocatedBefore)
        );

        assert.equal(
          allocatedBefore,
          parseEther("30")
        );


        // ==========================================
        // Supply before burn = 100 TIM
        // ==========================================

        const supplyBefore =
          await token.read.totalSupply();

        assert.equal(
          supplyBefore,
          parseEther("100")
        );


        // ==========================================
        // Move to exactly 20 minutes
        // ==========================================

        await networkHelpers.time.setNextBlockTimestamp(
          startTime + 1200n
        );


        // finalizeAuction() itself becomes the next block
        await auction.write.finalizeAuction();


        // ==========================================
        // Auction must now be finalized
        // ==========================================

        const finalized =
          await auction.read.finalized();

        assert.equal(
          finalized,
          true
        );


        // It was NOT sold out

        const soldOut =
          await auction.read.soldOut();

        assert.equal(
          soldOut,
          false
        );


        // ==========================================
        // Clearing price should equal reserve price
        // ==========================================

        const clearingPrice =
          await auction.read.clearingPrice();

        console.log(
          "Expiry clearing price:",
          formatEther(clearingPrice),
          "ETH/TIM"
        );

        assert.equal(
          clearingPrice,
          parseEther("0.2")
        );


        // ==========================================
        // Unsold:
        //
        // 100 total
        // -30 allocated
        // =70 TIM burn
        // ==========================================

        const supplyAfter =
          await token.read.totalSupply();

        console.log(
          "TIM total supply after burn:",
          formatEther(supplyAfter)
        );

        assert.equal(
          supplyAfter,
          parseEther("30")
        );


        // Auction should still hold the 30 TIM
        // allocated to Alice and Bob.
        //
        // Those are waiting to be claimed.

        const auctionTokenBalance =
          await token.read.balanceOf([
            auction.address,
          ]);

        console.log(
          "TIM remaining in auction for winners:",
          formatEther(auctionTokenBalance)
        );

        assert.equal(
          auctionTokenBalance,
          parseEther("30")
        );


        // ==========================================
        // Verify bidder records remained intact
        // ==========================================

        const aliceBid =
          await auction.read.bids([
            alice.account.address,
          ]);

        const bobBid =
          await auction.read.bids([
            bob.account.address,
          ]);


        assert.equal(
          aliceBid[1],
          parseEther("10")
        );

        assert.equal(
          bobBid[1],
          parseEther("20")
        );
      }
    );

  }
);