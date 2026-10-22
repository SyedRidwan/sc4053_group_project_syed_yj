/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect / Reown project ID; without it only browser-extension wallets are offered */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  /** Sepolia RPC endpoint; defaults to a public RPC */
  readonly VITE_SEPOLIA_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
