// End-to-end test of the whole auction through the real UI.
//
// Prerequisites, from the repository root:
//   npm run node                  (terminal 1: local chain)
//   npm --prefix frontend run dev (terminal 2: the app on http://localhost:5173)
// Then:  npm --prefix frontend run e2e [screenshot-dir]
//
// A small EIP-1193 wallet is injected into each page. It forwards requests to the local node,
// whose test accounts are unlocked, so transactions confirm without a wallet extension.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "frontend", "e2e", "screenshots"));
const APP = process.env.APP_URL ?? "http://localhost:5173/";
const RPC = "http://127.0.0.1:8545";
const SELLER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat account #0 (deployer)
const BIDDER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"; // Hardhat account #5

const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const problems = [];
const step = (message) => console.log(`  ✓ ${message}`);

function injectWallet(account, rpc) {
  window.ethereum = {
    isMetaMask: true,
    on() {},
    removeListener() {},
    async request({ method, params = [] }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") {
        return [{ parentCapability: "eth_accounts" }];
      }
      if (method.startsWith("wallet_")) return null;
      if (method === "eth_sendTransaction") params = [{ ...params[0], from: account }];
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      const json = await response.json();
      if (json.error) throw Object.assign(new Error(json.error.message), json.error);
      return json.result;
    },
  };
}

async function waitText(page, text, timeout = 30000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
  } catch {
    await page.screenshot({ path: path.join(OUT, "failure.png"), fullPage: true });
    throw new Error(`Timed out waiting for "${text}" (see failure.png)`);
  }
}

async function clickButton(page, text) {
  const result = await page.evaluate((t) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.offsetParent !== null && b.innerText.trim().startsWith(t)
    );
    if (!button) return "missing";
    if (button.disabled) return "disabled";
    button.click();
    return "clicked";
  }, text);
  if (result !== "clicked") {
    await page.screenshot({ path: path.join(OUT, "failure.png"), fullPage: true });
    throw new Error(`Button "${text}" is ${result} (see failure.png)`);
  }
}

async function openAs(browser, account, label, auctionAddress) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("console", (m) => m.type() === "error" && problems.push(`[${label}] ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`[${label}] ${e.message}`));
  await page.evaluateOnNewDocument(injectWallet, account, RPC);
  await page.goto(APP, { waitUntil: "networkidle2" });
  // The Contracts card shows the auction address, so this confirms the fresh deployment loaded
  await waitText(page, auctionAddress.slice(0, 6));

  await clickButton(page, "Connect Wallet");
  await page.waitForSelector("[role=dialog] button");
  await page.evaluate(() =>
    [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim() === "Browser Wallet").click()
  );
  // "NTU in wallet" only renders once a wallet is connected and its position has loaded
  await page.waitForFunction(() => document.querySelector(".card-position")?.innerText.includes("NTU in wallet"), {
    timeout: 30000,
  });
  return page;
}

const executablePath = BROWSERS.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error("No Chrome or Edge found; set BROWSER_PATH");
mkdirSync(OUT, { recursive: true });

console.log("Deploying a fresh, unstarted auction to localhost…");
execSync("npx hardhat auction:deploy --network localhost", { cwd: ROOT, stdio: "ignore" });
const { auction } = JSON.parse(readFileSync(path.join(ROOT, "deployments", "localhost.json"), "utf8"));

// Ubuntu 24.04 CI runners block Chrome's user-namespace sandbox, so CI runs without it
const browser = await puppeteer.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
try {
  const seller = await openAs(browser, SELLER, "seller", auction.address);
  step("seller connected");
  await waitText(seller, "Approve and start auction");
  await seller.screenshot({ path: path.join(OUT, "1-not-started.png"), fullPage: true });
  await clickButton(seller, "Approve and start auction");
  await waitText(seller, "Start auction confirmed");
  await waitText(seller, "Live");
  step("seller approved the supply and started the auction");

  const bidder = await openAs(browser, BIDDER, "bidder", auction.address);
  step("bidder connected");
  await bidder.locator("#bid-amount").fill("20");
  await waitText(bidder, "You receive at least");
  await clickButton(bidder, "Place bid");
  await waitText(bidder, "Bid confirmed");
  step("20 ETH bid confirmed");

  await bidder.locator("#bid-amount").fill("100");
  await waitText(bidder, "This bid sells out the auction");
  await bidder.screenshot({ path: path.join(OUT, "2-sellout-preview.png"), fullPage: true });
  await clickButton(bidder, "Place bid");
  await waitText(bidder, "Settled");
  step("100 ETH bid capped, surplus refunded, auction settled");

  await waitText(bidder, "Claim tokens");
  await clickButton(bidder, "Claim tokens");
  await waitText(bidder, "Claim confirmed");
  step("bidder claimed tokens");

  await waitText(seller, "Withdraw", 15000);
  await clickButton(seller, "Withdraw");
  await waitText(seller, "have been withdrawn", 15000);
  step("seller withdrew the proceeds");

  await bidder.reload({ waitUntil: "networkidle2" });
  await waitText(bidder, "Result");
  const result = await bidder.evaluate(() => document.querySelector(".card-result").innerText);
  if (!result.includes("1,000 NTU")) throw new Error(`Unexpected result card:\n${result}`);
  await bidder.screenshot({ path: path.join(OUT, "3-settled-desktop.png"), fullPage: true });
  await bidder.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await bidder.screenshot({ path: path.join(OUT, "3-settled-mobile.png"), fullPage: true });
  if (await bidder.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
    throw new Error("Page scrolls horizontally at 390px wide");
  }
  step("result card shows 1,000 NTU sold; no horizontal scroll on mobile");

  if (problems.length) throw new Error(`Console errors:\n${problems.join("\n")}`);
  console.log(`Passed. Screenshots in ${OUT}`);
} finally {
  await browser.close();
}
