import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

import {
  parseEther,
  formatEther,
} from "viem";


describe(
  "DutchAuction - Seller Proceeds",
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


      // ============================================
      // 100 TIM
      // ============================================

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


      // ============================================
      // Transfer 100 TIM to auction
      // ============================================

      await token.write.transfer([
        auction.address,
        tokensForSale,
      ]);


      const startTime =
        await auction.read.startTime();


      // ============================================
      // Alice
      //
      // 5 min
      // price 0.8
      // 8 ETH -> 10 TIM
      // ============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 300n
      );

      await aliceAuction.write.bid([], {
        value: parseEther("8"),
      });


      // ============================================
      // Bob
      //
      // 10 min
      // price 0.6
      // 12 ETH -> 20 TIM
      // ============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 600n
      );

      await bobAuction.write.bid([], {
        value: parseEther("12"),
      });


      // ============================================
      // Expire auction at 20 min
      //
      // Pclear = reserve = 0.2
      // ============================================

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 1200n
      );

      await auction.write.finalizeAuction();


      return {
        viem,

        deployer,
        alice,
        bob,

        token,
        auction,

        aliceAuction,
        bobAuction,
      };
    }


    // =========================================================
    // Seller identification
    // =========================================================

    it(
      "should record the deployer as the seller",
      async function () {

        const {
          deployer,
          auction,
        } = await deployFixture();


        const seller =
          await auction.read.seller();


        console.log(
          "Seller:",
          seller
        );


        assert.equal(
          seller.toLowerCase(),
          deployer.account.address.toLowerCase()
        );
      }
    );


    // =========================================================
    // Proceeds after claims
    // =========================================================

    it(
      "should accumulate only the actual clearing-price payments as seller proceeds",
      async function () {

        const {
          auction,
          aliceAuction,
          bobAuction,
        } = await deployFixture();


        // Before claims:
        // no realized seller proceeds yet

        let proceeds =
          await auction.read.sellerProceeds();


        assert.equal(
          proceeds,
          0n
        );


        // Alice:
        // 10 TIM × 0.2 = 2 ETH

        await aliceAuction.write.claim();


        proceeds =
          await auction.read.sellerProceeds();


        console.log(
          "Proceeds after Alice:",
          formatEther(proceeds),
          "ETH"
        );


        assert.equal(
          proceeds,
          parseEther("2")
        );


        // Bob:
        // 20 TIM × 0.2 = 4 ETH
        //
        // Total = 6 ETH

        await bobAuction.write.claim();


        proceeds =
          await auction.read.sellerProceeds();


        console.log(
          "Proceeds after Bob:",
          formatEther(proceeds),
          "ETH"
        );


        assert.equal(
          proceeds,
          parseEther("6")
        );
      }
    );


    // =========================================================
    // Seller withdrawal
    // =========================================================

    it(
      "should allow the seller to withdraw the sale proceeds",
      async function () {

        const {
          viem,
          auction,
          aliceAuction,
          bobAuction,
        } = await deployFixture();


        const publicClient =
          await viem.getPublicClient();


        // Both users claim first

        await aliceAuction.write.claim();
        await bobAuction.write.claim();


        // Contract should now retain exactly
        // 6 ETH in realized sale proceeds.

        const contractBalanceBefore =
          await publicClient.getBalance({
            address: auction.address,
          });


        console.log(
          "Auction ETH before seller withdrawal:",
          formatEther(contractBalanceBefore)
        );


        assert.equal(
          contractBalanceBefore,
          parseEther("6")
        );


        // ============================================
        // Seller withdraws
        // ============================================

        await auction.write.withdrawProceeds();


        const contractBalanceAfter =
          await publicClient.getBalance({
            address: auction.address,
          });


        console.log(
          "Auction ETH after seller withdrawal:",
          formatEther(contractBalanceAfter)
        );


        assert.equal(
          contractBalanceAfter,
          0n
        );


        const proceedsAfter =
          await auction.read.sellerProceeds();


        assert.equal(
          proceedsAfter,
          0n
        );
      }
    );


    // =========================================================
    // Non-seller cannot withdraw
    // =========================================================

    it(
      "should reject withdrawal attempts from non-sellers",
      async function () {

        const {
          bobAuction,
          aliceAuction,
        } = await deployFixture();


        // Generate some seller proceeds
        await aliceAuction.write.claim();


        // Bob is NOT the seller.
        // This should revert.

        await assert.rejects(
          async () => {
            await bobAuction.write.withdrawProceeds();
          }
        );
      }
    );


    // =========================================================
    // Cannot withdraw twice
    // =========================================================

    it(
      "should prevent withdrawing the same proceeds twice",
      async function () {

        const {
          auction,
          aliceAuction,
        } = await deployFixture();


        await aliceAuction.write.claim();


        // Seller gets Alice's 2 ETH
        await auction.write.withdrawProceeds();


        // sellerProceeds is now zero.
        // Second withdrawal must fail.

        await assert.rejects(
          async () => {
            await auction.write.withdrawProceeds();
          }
        );
      }
    );

  }
);