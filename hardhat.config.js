require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");
require("./tasks/auction");

// Secrets live in Hardhat's per-user vars store, never in this repo:
//   npx hardhat vars set SEPOLIA_PRIVATE_KEY   (a throwaway wallet holding only test ETH)
//   npx hardhat vars set ETHERSCAN_API_KEY     (for contract verification)
//   npx hardhat vars set SEPOLIA_RPC_URL       (optional; defaults to a public RPC)
const SEPOLIA_RPC_URL = vars.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");
const SEPOLIA_ACCOUNTS = vars.has("SEPOLIA_PRIVATE_KEY") ? [vars.get("SEPOLIA_PRIVATE_KEY")] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: SEPOLIA_ACCOUNTS,
    },
  },
  etherscan: {
    apiKey: vars.get("ETHERSCAN_API_KEY", ""),
  },
  sourcify: {
    enabled: false,
  },
};
