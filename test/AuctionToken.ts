import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("AuctionToken", function () {
  async function deployToken() {
    const { viem } = await network.connect();

    const [deployer] = await viem.getWalletClients();

    const initialSupply = 1000n;

    const token = await viem.deployContract(
      "AuctionToken",
      [initialSupply]
    );

    return {
      token,
      deployer,
      initialSupply,
    };
  }

  it("should have the correct token name", async function () {
    const { token } = await deployToken();

    const name = await token.read.name();

    console.log("Token name:", name);

    assert.equal(name, "Hortons");
  });

  it("should have the correct token symbol", async function () {
    const { token } = await deployToken();

    const symbol = await token.read.symbol();

    console.log("Token symbol:", symbol);

    assert.equal(symbol, "TIM");
  });

  it("should use 18 decimals", async function () {
    const { token } = await deployToken();

    const decimals = await token.read.decimals();

    console.log("Decimals:", decimals);

    assert.equal(decimals, 18);
  });

  it("should mint the correct initial supply", async function () {
    const { token } = await deployToken();

    const totalSupply = await token.read.totalSupply();

    console.log(
      "Total supply:",
      totalSupply.toString()
    );

    assert.equal(
      totalSupply,
      parseEther("1000")
    );
  });

  it("should give the initial supply to the deployer", async function () {
    const {
      token,
      deployer
    } = await deployToken();

    const balance = await token.read.balanceOf([
      deployer.account.address
    ]);

    console.log(
      "Deployer balance:",
      balance.toString()
    );

    assert.equal(
      balance,
      parseEther("1000")
    );
  });

  it("should permanently reduce total supply when tokens are burned", async function () {
    const {
      token,
      deployer
    } = await deployToken();

    const burnAmount = parseEther("100");

    await token.write.burn(
      [burnAmount],
      {
        account: deployer.account
      }
    );

    const totalSupply =
      await token.read.totalSupply();

    const deployerBalance =
      await token.read.balanceOf([
        deployer.account.address
      ]);

    console.log(
      "Supply after burning 100 TIM:",
      totalSupply.toString()
    );

    assert.equal(
      totalSupply,
      parseEther("900")
    );

    assert.equal(
      deployerBalance,
      parseEther("900")
    );
  });
});