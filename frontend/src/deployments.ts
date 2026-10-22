import type { Address, Hash } from "viem";

export interface Deployment {
  network: string;
  chainId: number;
  deployer: Address;
  params: { supply: string; startPrice: string; reservePrice: string };
  token: { address: Address; blockNumber: number; txHash: Hash };
  auction: { address: Address; blockNumber: number; txHash: Hash };
}

// Written by `npx hardhat auction:deploy`. The in-process "hardhat" network is skipped:
// its contracts disappear when the command that deployed them exits.
const files = import.meta.glob<Deployment>("../../deployments/*.json", { eager: true, import: "default" });

export const deployments: Record<number, Deployment> = {};
for (const deployment of Object.values(files)) {
  if (deployment.network !== "hardhat") {
    deployments[deployment.chainId] = deployment;
  }
}

export const explorers: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io",
};
