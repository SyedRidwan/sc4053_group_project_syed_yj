import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { hardhat } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// WalletConnect-based wallets need a project ID (free at cloud.reown.com). Without one,
// only browser-extension wallets such as MetaMask are offered.
const wallets = projectId
  ? [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
  : [metaMaskWallet, injectedWallet];

const connectors = connectorsForWallets([{ groupName: "Wallets", wallets }], {
  appName: "Horton's Launchpad",
  projectId: projectId ?? "browser-extension-only",
});

export const config = createConfig({
  connectors,
  chains: [hardhat],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});

export type ChainId = (typeof config)["chains"][number]["id"];

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
