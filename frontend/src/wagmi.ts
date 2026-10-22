import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// WalletConnect-based wallets need a project ID (free at cloud.reown.com). Without one,
// only browser-extension wallets such as MetaMask are offered.
const wallets = projectId
  ? [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
  : [metaMaskWallet, injectedWallet];

const connectors = connectorsForWallets([{ groupName: "Wallets", wallets }], {
  appName: "NTU Token Launch",
  projectId: projectId ?? "browser-extension-only",
});

export const config = createConfig({
  connectors,
  chains: [hardhat, sepolia],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
  },
});

export type ChainId = (typeof config)["chains"][number]["id"];

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
