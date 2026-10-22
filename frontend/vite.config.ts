import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The app reads ../deployments/*.json, written by `npx hardhat auction:deploy`
    fs: { allow: [".."] },
  },
});
