const { expect } = require("chai");
const hre = require("hardhat");
const { loadDeployment } = require("../tasks/auction");

const E = hre.ethers.parseEther;

// Runs a task with its console output suppressed
async function runQuiet(name, args = {}) {
  const log = console.log;
  console.log = () => {};
  try {
    return await hre.run(name, args);
  } finally {
    console.log = log;
  }
}

async function deployedContracts() {
  const deployment = loadDeployment(hre);
  return {
    deployment,
    token: await hre.ethers.getContractAt("HortonsToken", deployment.token.address),
    auction: await hre.ethers.getContractAt("DutchAuction", deployment.auction.address),
  };
}

describe("Hardhat auction tasks", function () {
  it("auction:deploy records addresses, parameters and ABIs for the frontend", async function () {
    const deployment = await runQuiet("auction:deploy", { supply: "500", startPrice: "0.2", reservePrice: "0.05" });

    expect(deployment.network).to.equal("hardhat");
    expect(deployment.params.supply).to.equal(E("500").toString());
    expect(deployment.auction.abi.some((item) => item.name === "bid")).to.equal(true);
    expect(loadDeployment(hre).auction.address).to.equal(deployment.auction.address);

    const { auction } = await deployedContracts();
    expect(await auction.startPrice()).to.equal(E("0.2"));
    expect(await auction.reservePrice()).to.equal(E("0.05"));
  });

  it("auction:demo --scenario soldout settles at 0.06 ETH and pays everyone", async function () {
    await runQuiet("auction:demo", { scenario: "soldout" });
    const { auction, token } = await deployedContracts();
    const [seller, alice, bob] = await hre.ethers.getSigners();

    expect(await auction.clearingPrice()).to.equal(E("0.06"));
    expect(await token.balanceOf(alice.address)).to.equal(E("800"));
    expect(await token.balanceOf(bob.address)).to.equal(E("200"));
    expect(await auction.proceedsWithdrawn()).to.equal(true);
    expect(await hre.ethers.provider.getBalance(await auction.getAddress())).to.equal(0);
    expect(seller.address).to.equal(loadDeployment(hre).deployer);
  });

  it("auction:demo --scenario expiry settles at the reserve and burns the rest", async function () {
    await runQuiet("auction:demo", { scenario: "expiry" });
    const { auction, token } = await deployedContracts();

    expect(await auction.clearingPrice()).to.equal(E("0.02"));
    expect(await token.totalSupply()).to.equal(E("250"));
  });

  it("auction:demo --scenario live leaves an active auction with 25 ETH committed", async function () {
    await runQuiet("auction:demo", { scenario: "live" });
    const { auction } = await deployedContracts();

    expect(await auction.isActive()).to.equal(true);
    expect(await auction.totalCommitted()).to.equal(E("25"));
    await runQuiet("auction:status", { account: (await hre.ethers.getSigners())[1].address });
  });

  it("rejects unknown scenarios", async function () {
    await expect(runQuiet("auction:demo", { scenario: "nope" })).to.be.rejectedWith("Unknown scenario");
  });
});
