const fs = require("fs");
const path = require("path");
const { task, types } = require("hardhat/config");
const { HardhatPluginError } = require("hardhat/plugins");

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const PLUGIN = "launchpad";

const LISTING_SECONDS = 1200;
const MIN_EXPIRES_IN = 30;

function deploymentFile(hre) {
  return path.join(DEPLOYMENTS_DIR, `launchpad-${hre.network.name}.json`);
}

function requireLocal(hre, taskName) {
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    throw new HardhatPluginError(PLUGIN, `${taskName} only works on a local network (hardhat or localhost)`);
  }
}

task("launchpad:deploy", "Deploys LaunchFactory and records it in deployments/launchpad-<network>.json").setAction(
  async (_, hre) => {
    requireLocal(hre, "launchpad:deploy");
    await hre.run("compile", { quiet: true });

    // Account #0 deploys and acts as curator
    const [deployer] = await hre.ethers.getSigners();
    const factory = await hre.ethers.deployContract("LaunchFactory", [deployer.address], deployer);
    const receipt = await factory.deploymentTransaction().wait();
    const { chainId } = await hre.ethers.provider.getNetwork();

    const deployment = {
      network: hre.network.name,
      chainId: Number(chainId),
      curator: deployer.address,
      deployedAt: new Date().toISOString(),
      factory: { address: await factory.getAddress(), blockNumber: receipt.blockNumber, txHash: receipt.hash },
    };
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
    fs.writeFileSync(deploymentFile(hre), JSON.stringify(deployment, null, 2) + "\n");
    console.log(`LaunchFactory: ${deployment.factory.address}`);
    console.log(`Curator:       ${deployment.curator}`);
    return deployment;
  }
);

task("launchpad:seed", "Deploys the factory and fills the market with listings in every state (local networks only)")
  .addOptionalParam("expiresIn", "Seconds until the Nova listing expires, so its burn can be watched", 240, types.int)
  .setAction(async (args, hre) => {
    requireLocal(hre, "launchpad:seed");
    const expiresIn = args.expiresIn;
    const novaElapsed = LISTING_SECONDS - expiresIn;
    if (expiresIn < MIN_EXPIRES_IN || novaElapsed < 600) {
      throw new HardhatPluginError(PLUGIN, `--expires-in must be between ${MIN_EXPIRES_IN} and ${LISTING_SECONDS - 600} seconds`);
    }

    await hre.run("launchpad:deploy");
    const { factory: factoryInfo } = JSON.parse(fs.readFileSync(deploymentFile(hre), "utf8"));
    const factory = await hre.ethers.getContractAt("LaunchFactory", factoryInfo.address);

    const signers = await hre.ethers.getSigners();
    const [curator, sellerA, sellerB] = signers;
    const [bidder1, bidder2, bidder3, bidder4] = signers.slice(5, 9);
    const scammer = signers[9];
    const E = hre.ethers.parseEther;

    const advance = async (seconds) => {
      await hre.network.provider.send("evm_increaseTime", [seconds]);
      await hre.network.provider.send("evm_mine");
    };

    const create = async (seller, name, symbol, supply, startPrice, reservePrice) => {
      const id = await factory.launchCount();
      await (await factory.connect(seller).createLaunch(name, symbol, E(supply), E(startPrice), E(reservePrice))).wait();
      const { auction: address } = await factory.launchAt(id);
      console.log(`  #${id} ${name} (${symbol})`);
      return { id, auction: await hre.ethers.getContractAt("DutchAuction", address), seller };
    };

    const bid = async (listing, bidder, eth) => {
      await (await listing.auction.connect(bidder).bid({ value: E(eth) })).wait();
    };

    console.log("Creating listings:");

    // Sold out and settled, with proceeds left for the seller to withdraw on camera
    const aurora = await create(sellerA, "Aurora", "AUR", "1000", "0.1", "0.02");
    await advance(300);
    await bid(aurora, bidder1, "48");
    await advance(300);
    await bid(aurora, bidder2, "25");
    await (await aurora.auction.connect(bidder1).claim()).wait();

    // Expired and settled at the reserve, so the unsold half has been burned
    const cobalt = await create(sellerB, "Cobalt", "COB", "1000", "0.05", "0.01");
    await advance(600);
    await bid(cobalt, bidder3, "5");
    await advance(601);
    await (await cobalt.auction.finalize()).wait();
    await (await cobalt.auction.connect(bidder3).claim()).wait();
    await (await factory.connect(sellerB).withdrawProceeds(cobalt.id)).wait();

    // Expires shortly after seeding, with too little ETH to sell out, so the burn happens live
    const nova = await create(sellerB, "Nova", "NOVA", "5000", "0.02", "0.004");
    await advance(novaElapsed - 600);

    // Halfway through, with enough room left for a bridging bid to sell it out and get a refund
    const meridian = await create(sellerA, "Meridian", "MRD", "2000", "0.05", "0.01");
    await bid(meridian, bidder2, "2");
    // A misleading listing for the curator to hide
    await create(scammer, "Free Money", "FREE", "1000000", "0.001", "0.0001");
    await advance(300);
    await bid(meridian, bidder3, "6");
    await bid(nova, bidder1, "3");
    await advance(300);
    await bid(meridian, bidder4, "4");
    await bid(nova, bidder4, "2");

    // The main listing: a full 20 minutes from now, with two opening bids
    const hortons = await create(sellerA, "Horton's", "TIM", "1000", "0.1", "0.02");
    await bid(hortons, bidder1, "10");
    await bid(hortons, bidder2, "15");

    for (const listing of [hortons, aurora, cobalt]) {
      await (await factory.connect(curator).setVerified(listing.id, true)).wait();
    }

    console.log(`\nSeeded ${await factory.launchCount()} listings. Nova expires in about ${expiresIn} seconds.`);
    // Exiting the instant the last RPC response lands trips a libuv assertion under Node 24 on Windows
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { factory: factoryInfo.address };
  });
