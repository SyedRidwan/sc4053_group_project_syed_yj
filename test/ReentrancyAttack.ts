import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

import {
  parseEther,
  formatEther,
} from "viem";


describe(
  "DutchAuction - Reentrancy Resistance",
  function () {

    async function deployFixture() {

      const {
        viem,
        networkHelpers,
      } = await network.create();

      const [
        deployer,
        bob,
      ] = await viem.getWalletClients();


      // ==================================================
      // Deploy 100 TIM
      // ==================================================

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


      // ==================================================
      // Deploy Auction
      // ==================================================

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


      // ==================================================
      // Put 100 TIM into auction escrow
      // ==================================================

      await token.write.transfer([
        auction.address,
        tokensForSale,
      ]);


      // ==================================================
      // Deploy malicious attacker contract
      // ==================================================

      const attackerDeployed =
        await viem.deployContract(
          "ReentrancyAttacker",
          [
            auction.address,
          ]
        );


      const attacker =
        await viem.getContractAt(
          "ReentrancyAttacker",
          attackerDeployed.address,
          {
            client: {
              wallet: deployer,
            },
          }
        );


      // ==================================================
      // Auction bidding
      // ==================================================

      const startTime =
        await auction.read.startTime();


      // --------------------------------------------------
      // Attacker bids at 5 minutes
      //
      // Price = 0.8 ETH
      // 8 ETH -> 10 TIM
      // --------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 300n
      );


      await attacker.write.placeBid([], {
        value: parseEther("8"),
      });


      // --------------------------------------------------
      // Bob bids at 10 minutes
      //
      // 12 ETH -> 20 TIM
      // --------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 600n
      );


      await bobAuction.write.bid([], {
        value: parseEther("12"),
      });


      // --------------------------------------------------
      // Auction expires
      //
      // Clearing price = 0.2 ETH
      // --------------------------------------------------

      await networkHelpers.time.setNextBlockTimestamp(
        startTime + 1200n
      );


      await auction.write.finalizeAuction();


      return {
        viem,

        token,
        auction,
        attacker,

        attackerAddress:
          attackerDeployed.address,
      };
    }


    // ====================================================
    // MAIN ATTACK TEST
    // ====================================================

    it(
      "should block a reentrant claim attempt",
      async function () {

        const {
          viem,
          token,
          auction,
          attacker,
          attackerAddress,
        } = await deployFixture();


        const publicClient =
          await viem.getPublicClient();


        // ================================================
        // Check attacker's legitimate auction allocation
        // ================================================

        const bidBefore =
          await auction.read.bids([
            attackerAddress,
          ]);


        console.log(
          "Attacker committed:",
          formatEther(bidBefore[0]),
          "ETH"
        );

        console.log(
          "Attacker allocated:",
          formatEther(bidBefore[1]),
          "TIM"
        );


        assert.equal(
          bidBefore[0],
          parseEther("8")
        );


        assert.equal(
          bidBefore[1],
          parseEther("10")
        );


        // ================================================
        // Expected legitimate refund
        //
        // 10 TIM × 0.2 = 2 ETH
        //
        // 8 - 2 = 6 ETH refund
        // ================================================

        const refund =
          await auction.read.getRefund([
            attackerAddress,
          ]);


        console.log(
          "Legitimate refund:",
          formatEther(refund),
          "ETH"
        );


        assert.equal(
          refund,
          parseEther("6")
        );


        // ================================================
        // Balances BEFORE attack
        // ================================================

        const attackerTokenBefore =
          await token.read.balanceOf([
            attackerAddress,
          ]);


        const attackerEthBefore =
          await publicClient.getBalance({
            address: attackerAddress,
          });


        assert.equal(
          attackerTokenBefore,
          0n
        );


        // ================================================
        // ATTACK
        //
        // First claim is legitimate.
        //
        // When refund reaches receive(),
        // attacker tries claim() a second time.
        // ================================================

        await attacker.write.attackClaim();


        // ================================================
        // Did receive() actually attempt reentrancy?
        // ================================================

        const attackAttempted =
          await attacker.read.attackAttempted();


        const reentrySucceeded =
          await attacker.read.reentrySucceeded();


        console.log(
          "Reentry attempted:",
          attackAttempted
        );

        console.log(
          "Reentry succeeded:",
          reentrySucceeded
        );


        assert.equal(
          attackAttempted,
          true
        );


        assert.equal(
          reentrySucceeded,
          false
        );


        // ================================================
        // Check final balances
        // ================================================

        const attackerTokenAfter =
          await token.read.balanceOf([
            attackerAddress,
          ]);


        const attackerEthAfter =
          await publicClient.getBalance({
            address: attackerAddress,
          });


        console.log(
          "TIM received:",
          formatEther(
            attackerTokenAfter -
            attackerTokenBefore
          )
        );


        console.log(
          "ETH received:",
          formatEther(
            attackerEthAfter -
            attackerEthBefore
          )
        );


        // Attacker gets ONLY legitimate 10 TIM

        assert.equal(
          attackerTokenAfter -
          attackerTokenBefore,
          parseEther("10")
        );


        // Attacker gets ONLY legitimate 6 ETH refund

        assert.equal(
          attackerEthAfter -
          attackerEthBefore,
          parseEther("6")
        );


        // ================================================
        // Auction state must show claimed = true
        // ================================================

        const bidAfter =
          await auction.read.bids([
            attackerAddress,
          ]);


        assert.equal(
          bidAfter[2],
          true
        );
      }
    );


    // ====================================================
    // SECOND CLAIM ALSO MUST FAIL
    // ====================================================

    it(
      "should not allow the attacker to claim again after the attack",
      async function () {

        const {
          attacker,
        } = await deployFixture();


        // Legitimate claim + failed reentry
        await attacker.write.attackClaim();


        // Another independent claim should also revert

        await assert.rejects(
          async () => {
            await attacker.write.attackClaim();
          }
        );
      }
    );

  }
);