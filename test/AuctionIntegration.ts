import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

import {
  parseEther,
  formatEther,
} from "viem";


describe("Hortons Dutch Auction - Integration", function () {

  async function deployFixture() {

    const { viem } = await network.create();

    const [deployer] =
      await viem.getWalletClients();


    // ---------------------------------
    // 1. Deploy Hortons token
    // ---------------------------------

    const token =
      await viem.deployContract(
        "AuctionToken",
        [1000n]
      );


    // ---------------------------------
    // 2. Auction parameters
    // ---------------------------------

    const startPrice =
      parseEther("1");

    const reservePrice =
      parseEther("0.2");

    const tokensForSale =
      parseEther("1000");


    // ---------------------------------
    // 3. Deploy DutchAuction
    // ---------------------------------

    const auction =
      await viem.deployContract(
        "DutchAuction",
        [
          token.address,
          startPrice,
          reservePrice,
          tokensForSale,
        ]
      );


    return {
      viem,
      deployer,
      token,
      auction,
      tokensForSale,
      startPrice,
      reservePrice,
    };
  }


  // =================================
  // Test 1
  // =================================

  it(
    "should deploy Hortons with symbol TIM",
    async function () {

      const { token } =
        await deployFixture();

      const name =
        await token.read.name();

      const symbol =
        await token.read.symbol();


      console.log(
        "Token:",
        name,
        "(" + symbol + ")"
      );


      assert.equal(
        name,
        "Hortons"
      );

      assert.equal(
        symbol,
        "TIM"
      );
    }
  );


  // =================================
  // Test 2
  // =================================

  it(
    "should mint 1000 TIM to the deployer",
    async function () {

      const {
        token,
        deployer,
      } = await deployFixture();


      const balance =
        await token.read.balanceOf([
          deployer.account.address
        ]);


      console.log(
        "Deployer TIM:",
        formatEther(balance)
      );


      assert.equal(
        balance,
        parseEther("1000")
      );
    }
  );


  // =================================
  // Test 3
  // =================================

  it(
    "should connect the Hortons token to DutchAuction",
    async function () {

      const {
        token,
        auction,
      } = await deployFixture();


      const auctionTokenAddress =
        await auction.read.token();


      console.log(
        "Hortons address:",
        token.address
      );

      console.log(
        "Auction token:",
        auctionTokenAddress
      );


      assert.equal(
        auctionTokenAddress.toLowerCase(),
        token.address.toLowerCase()
      );
    }
  );


  // =================================
  // Test 4
  // =================================

  it(
    "should transfer 1000 TIM into the auction contract",
    async function () {

      const {
        token,
        auction,
        deployer,
        tokensForSale,
      } = await deployFixture();


      // Send 1000 TIM from deployer
      // to DutchAuction

      await token.write.transfer(
        [
          auction.address,
          tokensForSale
        ],
        {
          account: deployer.account
        }
      );


      // Check Auction TIM balance

      const auctionBalance =
        await token.read.balanceOf([
          auction.address
        ]);


      // Check deployer balance

      const deployerBalance =
        await token.read.balanceOf([
          deployer.account.address
        ]);


      console.log(
        "Auction TIM balance:",
        formatEther(auctionBalance)
      );

      console.log(
        "Deployer TIM balance:",
        formatEther(deployerBalance)
      );


      assert.equal(
        auctionBalance,
        parseEther("1000")
      );


      assert.equal(
        deployerBalance,
        0n
      );
    }
  );

});