import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

import {
  parseEther,
  formatEther,
} from "viem";


describe(
  "DutchAuction - Uniform Price Settlement",
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
        charlie,
        dave,
      ] = await viem.getWalletClients();


      // =============================================
      // Deploy 100 TIM
      // =============================================

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


      // =============================================
      // Contract instances
      // =============================================

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


      // =============================================
      // Transfer all 100 TIM into escrow
      // =============================================

      await token.write.transfer([
        auction.address,
        tokensForSale,
      ]);


      // =============================================
      // Start simulation
      // =============================================

      const startTime =
        await auction.read.startTime();


      // Alice
      // 5 minutes
      // 8 ETH -> 10 TIM

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 300n
      );

      await aliceAuction.write.bid([], {
        value: parseEther("8"),
      });


      // Bob
      // 10 minutes
      // 12 ETH -> 20 TIM

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 600n
      );

      await bobAuction.write.bid([], {
        value: parseEther("12"),
      });


      // Charlie
      // 15 minutes
      // 20 ETH -> 50 TIM

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 900n
      );

      await charlieAuction.write.bid([], {
        value: parseEther("20"),
      });


      // Dave
      // 901 seconds
      // Partial fill: only 20 TIM remain

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 901n
      );

      await daveAuction.write.bid([], {
        value: parseEther("20"),
      });


      return {
        viem,

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


    // ===========================================================
    // TEST 1
    // Everyone gets same clearing price
    // ===========================================================

    it(
      "should calculate Alice's refund using the final clearing price",
      async function () {

        const {
          auction,
          alice,
        } = await deployFixture();


        const clearingPrice =
          await auction.read.clearingPrice();


        const aliceBid =
          await auction.read.bids([
            alice.account.address,
          ]);


        const refund =
          await auction.read.getRefund([
            alice.account.address,
          ]);


        const expectedFinalCost =
          (
            aliceBid[1] *
            clearingPrice
          ) / parseEther("1");


        const expectedRefund =
          aliceBid[0] -
          expectedFinalCost;


        console.log(
          "Clearing price:",
          formatEther(clearingPrice)
        );

        console.log(
          "Alice committed:",
          formatEther(aliceBid[0])
        );

        console.log(
          "Alice TIM:",
          formatEther(aliceBid[1])
        );

        console.log(
          "Alice final cost:",
          formatEther(expectedFinalCost)
        );

        console.log(
          "Alice refund:",
          formatEther(refund)
        );


        assert.equal(
          refund,
          expectedRefund
        );
      }
    );


    // ===========================================================
    // TEST 2
    // Claim tokens + refund
    // ===========================================================

    it(
      "should send TIM and refund ETH when Alice claims",
      async function () {

        const {
          viem,
          alice,
          token,
          auction,
          aliceAuction,
        } = await deployFixture();


        const publicClient =
          await viem.getPublicClient();


        const aliceBid =
          await auction.read.bids([
            alice.account.address,
          ]);


        const refund =
          await auction.read.getRefund([
            alice.account.address,
          ]);


        const auctionEthBefore =
          await publicClient.getBalance({
            address: auction.address,
          });


        const aliceTokenBefore =
          await token.read.balanceOf([
            alice.account.address,
          ]);


        // =============================================
        // Alice claims
        // =============================================

        await aliceAuction.write.claim();


        const auctionEthAfter =
          await publicClient.getBalance({
            address: auction.address,
          });


        const aliceTokenAfter =
          await token.read.balanceOf([
            alice.account.address,
          ]);


        console.log(
          "Alice TIM received:",
          formatEther(
            aliceTokenAfter -
            aliceTokenBefore
          )
        );

        console.log(
          "Alice ETH refund:",
          formatEther(refund)
        );


        // Alice should receive exactly
        // her allocated TIM

        assert.equal(
          aliceTokenAfter -
          aliceTokenBefore,
          aliceBid[1]
        );


        // Auction ETH balance should fall
        // exactly by Alice's refund

        assert.equal(
          auctionEthBefore -
          auctionEthAfter,
          refund
        );
      }
    );


    // ===========================================================
    // TEST 3
    // Dave's partial-fill refund
    // ===========================================================

    it(
      "should refund Dave for the partial fill",
      async function () {

        const {
          auction,
          dave,
        } = await deployFixture();


        const daveBid =
          await auction.read.bids([
            dave.account.address,
          ]);


        const refund =
          await auction.read.getRefund([
            dave.account.address,
          ]);


        console.log(
          "Dave committed:",
          formatEther(daveBid[0])
        );

        console.log(
          "Dave allocated:",
          formatEther(daveBid[1])
        );

        console.log(
          "Dave refund:",
          formatEther(refund)
        );


        assert.equal(
          daveBid[0],
          parseEther("20")
        );


        assert.equal(
          daveBid[1],
          parseEther("20")
        );


        // Dave should receive a very large refund
        // because he requested roughly 50 TIM,
        // but only 20 were left.

        assert.ok(
          refund > parseEther("12")
        );
      }
    );


    // ===========================================================
    // TEST 4
    // Cannot claim twice
    // ===========================================================

    it(
      "should prevent a bidder from claiming twice",
      async function () {

        const {
          aliceAuction,
        } = await deployFixture();


        await aliceAuction.write.claim();


        await assert.rejects(
          async () => {
            await aliceAuction.write.claim();
          }
        );
      }
    );

  }
);