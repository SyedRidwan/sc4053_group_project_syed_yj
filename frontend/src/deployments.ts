import type { Address, Hash } from "viem";

export interface Deployment {
  network: string;
  chainId: number;
  curator: Address;
  factory: { address: Address; blockNumber: number; txHash: Hash };
}

// Written by `npx hardhat launchpad:deploy`. The in-process "hardhat" network is skipped:
// its contracts disappear when the command that deployed them exits.
const files = import.meta.glob<Deployment>("../../deployments/launchpad-*.json", { eager: true, import: "default" });

export const deployments: Record<number, Deployment> = {};
for (const deployment of Object.values(files)) {
  if (deployment.network !== "hardhat") {
    deployments[deployment.chainId] = deployment;
  }
}
