/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect / Reown project ID; without it only browser-extension wallets are offered */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
