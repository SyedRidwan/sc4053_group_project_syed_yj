const fs = require("fs");
const path = require("path");
const { task, types } = require("hardhat/config");
const { HardhatPluginError } = require("hardhat/plugins");

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const LOCAL_NETWORKS = ["hardhat", "localhost"];
const VERIFY_CONFIRMATIONS = 5;
const PLUGIN = "auction";

// Sepolia faucets hand out a few hundredths of an ETH, so testnet prices are scaled down
// until selling out the whole supply costs 0.01-0.05 ETH
const DEFAULT_PARAMS = {
  local: { supply: "1000", startPrice: "0.1", reservePrice: "0.02" },
  testnet: { supply: "1000", startPrice: "0.00005", reservePrice: "0.00001" },
};

function isLocal(hre) {
  return LOCAL_NETWORKS.includes(hre.network.name);
}

function deploymentFile(hre) {
  return path.join(DEPLOYMENTS_DIR, `${hre.network.name}.json`);
}

function loadDeployment(hre) {
  const file = deploymentFile(hre);
  if (!fs.existsSync(file)) {
    throw new HardhatPluginError(
      PLUGIN,
      `No deployment found for "${hre.network.name}". Run: npx hardhat auction:deploy --network ${hre.network.name}`
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function getContracts(hre) {
  const deployment = loadDeployment(hre);
  const token = await hre.ethers.getContractAt("HortonsToken", deployment.token.address);
  const auction = await hre.ethers.getContractAt("DutchAuction", deployment.auction.address);
  return { deployment, token, auction };
}

async function getSigner(hre, index) {
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new HardhatPluginError(
      PLUGIN,
      `No account configured for "${hre.network.name}". Run: npx hardhat vars set SEPOLIA_PRIVATE_KEY`
    );
  }
  if (index >= signers.length) {
    throw new HardhatPluginError(
      PLUGIN,
      `Account #${index} is not available on "${hre.network.name}" (${signers.length} configured)`
    );
  }
  return signers[index];
}

function requireLocal(hre, taskName) {
  if (!isLocal(hre)) {
    throw new HardhatPluginError(PLUGIN, `${taskName} only works on a local network (hardhat or localhost)`);
  }
}

function eth(hre, wei) {
  return `${hre.ethers.formatEther(wei)} ETH`;
}

function tim(hre, amount) {
  return `${hre.ethers.formatEther(amount)} TIM`;
}

function parseEvents(contract, receipt, eventName) {
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((event) => event && event.name === eventName);
}

// Sends a transaction and waits for it, turning a revert into a one-line error
async function send(txPromise) {
  try {
    return await (await txPromise).wait();
  } catch (err) {
    const match = /reverted with reason string '([^']*)'/.exec(err.message ?? "");
    const reason = match?.[1] ?? err.reason ?? err.shortMessage ?? err.message;
    throw new HardhatPluginError(PLUGIN, `Transaction reverted: ${reason}`);
  }
}

// Local chain time control (hardhat and localhost only)
async function setNextTimestamp(hre, timestamp) {
  await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
}

async function increaseTime(hre, seconds) {
  await hre.network.provider.send("evm_increaseTime", [Number(seconds)]);
  await hre.network.provider.send("evm_mine");
}

async function latestTimestamp(hre) {
  const block = await hre.ethers.provider.getBlock("latest");
  return BigInt(block.timestamp);
}

task("auction:deploy", "Deploys HortonsToken and DutchAuction and records them in deployments/<network>.json")
  .addOptionalParam("supply", "Tokens for sale, in whole TIM", undefined, types.string)
  .addOptionalParam("startPrice", "Opening price in ETH per TIM", undefined, types.string)
  .addOptionalParam("reservePrice", "Reserve price in ETH per TIM", undefined, types.string)
  .addFlag("skipVerify", "Skip Etherscan verification on public networks")
  .setAction(async (args, hre) => {
    const defaults = isLocal(hre) ? DEFAULT_PARAMS.local : DEFAULT_PARAMS.testnet;
    const supply = hre.ethers.parseEther(args.supply ?? defaults.supply);
    const startPrice = hre.ethers.parseEther(args.startPrice ?? defaults.startPrice);
    const reservePrice = hre.ethers.parseEther(args.reservePrice ?? defaults.reservePrice);
    const deployer = await getSigner(hre, 0);

    await hre.run("compile", { quiet: true });
    console.log(`Deploying to ${hre.network.name} from ${deployer.address}`);

    const tokenArgs = ["Horton's", "TIM", supply];
    const token = await hre.ethers.deployContract("HortonsToken", tokenArgs, deployer);
    const tokenReceipt = await token.deploymentTransaction().wait();
    const tokenAddress = await token.getAddress();
    console.log(`  HortonsToken: ${tokenAddress}`);

    const auctionArgs = [tokenAddress, supply, startPrice, reservePrice];
    const auction = await hre.ethers.deployContract("DutchAuction", auctionArgs, deployer);
    const auctionReceipt = await auction.deploymentTransaction().wait();
    const auctionAddress = await auction.getAddress();
    console.log(`  DutchAuction: ${auctionAddress}`);

    const { chainId } = await hre.ethers.provider.getNetwork();
    const deployment = {
      network: hre.network.name,
      chainId: Number(chainId),
      deployer: deployer.address,
      deployedAt: new Date().toISOString(),
      params: {
        supply: supply.toString(),
        startPrice: startPrice.toString(),
        reservePrice: reservePrice.toString(),
      },
      token: {
        address: tokenAddress,
        blockNumber: tokenReceipt.blockNumber,
        txHash: tokenReceipt.hash,
        abi: (await hre.artifacts.readArtifact("HortonsToken")).abi,
      },
      auction: {
        address: auctionAddress,
        blockNumber: auctionReceipt.blockNumber,
        txHash: auctionReceipt.hash,
        abi: (await hre.artifacts.readArtifact("DutchAuction")).abi,
      },
    };
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
    fs.writeFileSync(deploymentFile(hre), JSON.stringify(deployment, null, 2) + "\n");
    console.log(`  Saved ${path.relative(process.cwd(), deploymentFile(hre))}`);

    if (!isLocal(hre) && !args.skipVerify) {
      if (!hre.config.etherscan.apiKey) {
        console.log("Skipping verification: run `npx hardhat vars set ETHERSCAN_API_KEY` first");
      } else {
        console.log(`Waiting for ${VERIFY_CONFIRMATIONS} confirmations before verifying...`);
        await auction.deploymentTransaction().wait(VERIFY_CONFIRMATIONS);
        for (const [address, constructorArguments] of [
          [tokenAddress, tokenArgs],
          [auctionAddress, auctionArgs],
        ]) {
          try {
            await hre.run("verify:verify", { address, constructorArguments });
          } catch (err) {
            console.log(`  Verification of ${address} failed: ${err.message}`);
          }
        }
      }
    }

    return deployment;
  });

task("auction:start", "Approves the sale supply and starts the 20-minute auction (seller only)").setAction(
  async (_, hre) => {
    const { auction, token } = await getContracts(hre);
    const seller = await getSigner(hre, 0);
    const supply = await auction.totalTokens();

    await send(token.connect(seller).approve(await auction.getAddress(), supply));
    await send(auction.connect(seller).start());

    const endTime = await auction.endTime();
    console.log(`Auction started; ends at ${new Date(Number(endTime) * 1000).toISOString()} (chain time)`);
  }
);

task("auction:status", "Prints the auction state, and optionally one bidder's position")
  .addOptionalParam("account", "Bidder address to report on", undefined, types.string)
  .setAction(async (args, hre) => {
    const { auction, token } = await getContracts(hre);
    const [startTime, endTime, finalized, soldOut] = await Promise.all([
      auction.startTime(),
      auction.endTime(),
      auction.finalized(),
      auction.soldOut(),
    ]);
    const now = await latestTimestamp(hre);
    const supply = await auction.totalTokens();
    const price = await auction.currentPrice();
    const committed = await auction.totalCommitted();

    let phase = "Active";
    if (startTime === 0n) phase = "Not started";
    else if (finalized) phase = "Finalized";
    else if (soldOut) phase = "Sold out (awaiting finalize)";
    else if (now >= endTime) phase = "Ended (awaiting finalize)";

    console.log(`Phase:            ${phase}`);
    if (startTime !== 0n && !finalized) {
      const remaining = endTime > now ? endTime - now : 0n;
      console.log(`Time remaining:   ${remaining / 60n}m ${remaining % 60n}s`);
    }
    console.log(`Current price:    ${eth(hre, price)} per TIM`);
    if (finalized) {
      console.log(`Committed:        ${eth(hre, committed)}`);
    } else {
      console.log(`Committed:        ${eth(hre, committed)} of ${eth(hre, (supply * price) / 10n ** 18n)} needed to sell out`);
    }
    if (finalized) {
      const sold = await auction.tokensSold();
      console.log(`Clearing price:   ${eth(hre, await auction.clearingPrice())} per TIM`);
      console.log(`Tokens sold:      ${tim(hre, sold)}`);
      console.log(`Tokens burned:    ${tim(hre, supply - sold)}`);
      console.log(`Token supply now: ${tim(hre, await token.totalSupply())}`);
      console.log(`Proceeds paid:    ${(await auction.proceedsWithdrawn()) ? "yes" : "no"}`);
    }

    if (args.account) {
      console.log(`\nBidder ${args.account}`);
      const commitment = await auction.commitments(args.account);
      console.log(`  Committed:      ${eth(hre, commitment)}`);
      if (finalized) {
        console.log(`  Tokens owed:    ${tim(hre, await auction.tokensOf(args.account))}`);
      } else if (soldOut) {
        // Clearing is fixed once sold out; claims are a pro-rata share of the supply
        console.log(`  Tokens owed:    ${tim(hre, committed === 0n ? 0n : (commitment * supply) / committed)}`);
      } else {
        // Until it sells out the clearing price can only fall, so this is a guaranteed minimum
        console.log(`  Tokens (min):   ${tim(hre, (commitment * 10n ** 18n) / price)} at the current price`);
      }
      console.log(`  Claimed:        ${(await auction.claimed(args.account)) ? "yes" : "no"}`);
    }
  });

task("auction:bid", "Commits ETH to the auction")
  .addParam("eth", "ETH to commit", undefined, types.string)
  .addOptionalParam("from", "Signer index to bid from", 0, types.int)
  .setAction(async (args, hre) => {
    const { auction } = await getContracts(hre);
    const bidder = await getSigner(hre, args.from);

    const receipt = await send(auction.connect(bidder).bid({ value: hre.ethers.parseEther(args.eth) }));
    const [placed] = parseEvents(auction, receipt, "BidPlaced");
    console.log(
      `${bidder.address} bid ${args.eth} ETH at ${eth(hre, placed.args.priceAtBid)} per TIM: ` +
        `accepted ${eth(hre, placed.args.ethAccepted)}, refunded ${eth(hre, placed.args.ethRefunded)}`
    );
    if (parseEvents(auction, receipt, "AuctionFinalized").length > 0) {
      console.log("This bid sold out the auction; it is now finalized");
    }
  });

task("auction:advance", "Moves local chain time forward (local networks only)")
  .addParam("seconds", "Seconds to advance", undefined, types.int)
  .setAction(async (args, hre) => {
    requireLocal(hre, "auction:advance");
    await increaseTime(hre, args.seconds);
    const now = await latestTimestamp(hre);
    console.log(`Advanced chain time by ${args.seconds}s to ${new Date(Number(now) * 1000).toISOString()}`);
    // Exiting the instant the last RPC response lands trips a libuv assertion under Node 24 on Windows
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

task("auction:finalize", "Settles the auction once it has sold out or expired").setAction(async (_, hre) => {
  const { auction } = await getContracts(hre);
  const caller = await getSigner(hre, 0);

  const receipt = await send(auction.connect(caller).finalize());
  const [finalized] = parseEvents(auction, receipt, "AuctionFinalized");
  console.log(
    `Finalized at ${eth(hre, finalized.args.clearingPrice)} per TIM: ` +
      `${tim(hre, finalized.args.tokensSold)} sold, ${tim(hre, finalized.args.tokensBurned)} burned`
  );
});

task("auction:claim", "Claims the caller's tokens")
  .addOptionalParam("from", "Signer index to claim for", 0, types.int)
  .setAction(async (args, hre) => {
    const { auction } = await getContracts(hre);
    const bidder = await getSigner(hre, args.from);

    const receipt = await send(auction.connect(bidder).claim());
    const [claimed] = parseEvents(auction, receipt, "TokensClaimed");
    console.log(`${bidder.address} claimed ${tim(hre, claimed.args.amount)}`);
  });

task("auction:withdraw", "Withdraws the sale proceeds to the seller").setAction(async (_, hre) => {
  const { auction } = await getContracts(hre);
  const seller = await getSigner(hre, 0);

  const receipt = await send(auction.connect(seller).withdrawProceeds());
  const [withdrawn] = parseEvents(auction, receipt, "ProceedsWithdrawn");
  console.log(`Seller received ${eth(hre, withdrawn.args.amount)}`);
});

task("auction:demo", "Deploys a fresh auction and plays a scenario (local networks only)")
  .addOptionalParam("scenario", "live | soldout | expiry", "live", types.string)
  .setAction(async (args, hre) => {
    requireLocal(hre, "auction:demo");
    if (!["live", "soldout", "expiry"].includes(args.scenario)) {
      throw new HardhatPluginError(PLUGIN, `Unknown scenario "${args.scenario}"; use live, soldout or expiry`);
    }

    await hre.run("auction:deploy");
    await hre.run("auction:start");
    const { auction } = await getContracts(hre);
    const startTime = await auction.startTime();

    // Lands each bid exactly `t` seconds into the auction, so prices are round numbers
    const bidAt = async (t, from, value) => {
      await setNextTimestamp(hre, startTime + BigInt(t));
      await hre.run("auction:bid", { eth: value, from });
    };

    if (args.scenario === "live") {
      await bidAt(120, 1, "10");
      await bidAt(240, 2, "15");
      // 25 ETH buys the whole supply once the price falls to 0.025 ETH, at t = 1125 s
      console.log("\nAuction left running for the frontend. With no more bids it sells out at t = 1125 s");
    }

    if (args.scenario === "soldout") {
      await bidAt(300, 1, "48");
      await bidAt(600, 2, "25");
      await hre.run("auction:claim", { from: 1 });
      await hre.run("auction:claim", { from: 2 });
      await hre.run("auction:withdraw");
    }

    if (args.scenario === "expiry") {
      await bidAt(600, 1, "5");
      await setNextTimestamp(hre, startTime + 20n * 60n);
      await hre.network.provider.send("evm_mine");
      await hre.run("auction:finalize");
      await hre.run("auction:claim", { from: 1 });
      await hre.run("auction:withdraw");
    }

    console.log("");
    await hre.run("auction:status");
  });

task("auction:export-abi", "Writes typed ABIs for the frontend to frontend/src/abi.ts").setAction(async (_, hre) => {
  await hre.run("compile", { quiet: true });
  const file = path.join(__dirname, "..", "frontend", "src", "abi.ts");
  const abiFor = async (name) => JSON.stringify((await hre.artifacts.readArtifact(name)).abi, null, 2);

  const source = [
    "// Generated by `npx hardhat auction:export-abi`. Do not edit by hand.",
    "",
    `export const dutchAuctionAbi = ${await abiFor("DutchAuction")} as const;`,
    "",
    `export const hortonsTokenAbi = ${await abiFor("HortonsToken")} as const;`,
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
});

module.exports = { loadDeployment };
