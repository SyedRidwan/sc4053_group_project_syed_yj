import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles.css";

import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { useTheme } from "./lib/theme";
import { config } from "./wagmi";

const queryClient = new QueryClient();

const WALLET_THEMES = {
  light: lightTheme({ accentColor: "#c7381a", borderRadius: "small" }),
  dark: darkTheme({ accentColor: "#ff7a50", accentColorForeground: "#1a1410", borderRadius: "small" }),
};

function Root() {
  const theme = useTheme();
  return (
    <RainbowKitProvider theme={WALLET_THEMES[theme]}>
      <App />
    </RainbowKitProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
