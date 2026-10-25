import { network } from "hardhat";
import { formatEther } from "viem";

const { viem } = await network.create();

const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

const chainId = await publicClient.getChainId();

const balance = await publicClient.getBalance({
  address: wallet.account.address,
});

console.log("Chain ID:", chainId);
console.log("Wallet:", wallet.account.address);
console.log("Sepolia ETH:", formatEther(balance));
