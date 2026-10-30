// End-to-end test of the whole launchpad through the real UI.
//
// Prerequisites, from the repository root:
//   npm run node                  (terminal 1: local chain)
//   npm --prefix frontend run dev (terminal 2: the app on http://localhost:5173)
// Then:  npm --prefix frontend run e2e [screenshot-dir]
//
// A small EIP-1193 wallet is injected into each page. It forwards requests to the local node,
// whose test accounts are unlocked, so transactions confirm without a wallet extension.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "frontend", "e2e", "screenshots"));
const APP = process.env.APP_URL ?? "http://localhost:5173/";
const RPC = "http://127.0.0.1:8545";
const CURATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat account #0 (deployer)
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dC79C8"; // Hardhat account #1
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

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await response.json()).result;
}

async function fail(page, message) {
  await page.screenshot({ path: path.join(OUT, "failure.png"), fullPage: true });
  throw new Error(`${message} (see failure.png)`);
}

async function waitText(page, text, timeout = 30000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
  } catch {
    await fail(page, `Timed out waiting for "${text}"`);
  }
}

async function waitGone(page, text, timeout = 15000) {
  try {
    await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, text);
  } catch {
    await fail(page, `"${text}" is still on the page`);
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
  if (result !== "clicked") await fail(page, `Button "${text}" is ${result}`);
}

async function open(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

async function openAs(browser, account, label) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("console", (m) => m.type() === "error" && problems.push(`[${label}] ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`[${label}] ${e.message}`));
  await page.evaluateOnNewDocument(injectWallet, account, RPC);
  await page.goto(`${APP}#/portfolio`, { waitUntil: "networkidle2" });

  await clickButton(page, "Connect Wallet");
  await page.waitForSelector("[role=dialog] button");
  await page.evaluate(() =>
    [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim() === "Browser Wallet").click()
  );
  // "Your bids" only renders once a wallet is connected
  await waitText(page, "Your bids");
  return page;
}

async function fillLaunch(page, { name, symbol, supply, start, reserve }) {
  const fields = { name, symbol, supply, startPrice: start, reservePrice: reserve };
  for (const [field, value] of Object.entries(fields)) {
    // A triple click selects what is there, so typing replaces it
    await page.click(`#create-${field}`, { count: 3 });
    await page.keyboard.type(value);
  }
}

async function expectNoHorizontalScroll(page, where) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
    await fail(page, `${where} scrolls horizontally at 390px wide`);
  }
}

const executablePath = BROWSERS.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error("No Chrome or Edge found; set BROWSER_PATH");
mkdirSync(OUT, { recursive: true });

console.log("Deploying a fresh factory to localhost…");
execSync("npx hardhat launchpad:deploy --network localhost", { cwd: ROOT, stdio: "ignore" });

// Ubuntu 24.04 CI runners block Chrome's user-namespace sandbox, so CI runs without it
const browser = await puppeteer.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
try {
  // Give Vite's reload of the new deployment file time to reach any page opened next
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const seller = await openAs(browser, SELLER, "seller");
  step("seller connected with no sign-up");

  await open(seller, "#/create");
  await waitText(seller, "Fill in the form to preview your launch");
  await seller.locator("#create-name").fill("Test");
  await clickButton(seller, "Launch token and start the auction");
  await waitText(seller, "Enter a symbol of 1 to 11 characters");
  await fillLaunch(seller, { name: "Test", symbol: "TST", supply: "1000", start: "0.03", reserve: "0.02" });
  await waitText(seller, "at least twice the reserve");
  step("form explains invalid values before the wallet opens");

  await fillLaunch(seller, { name: "Alpha Coin", symbol: "ALP", supply: "1000", start: "0.1", reserve: "0.02" });
  await waitText(seller, "Exactly 20 minutes");
  await seller.screenshot({ path: path.join(OUT, "1-create.png"), fullPage: true });
  await clickButton(seller, "Launch token and start the auction");
  await waitText(seller, "Alpha Coin");
  await waitText(seller, "You are the seller");
  step("seller launched Alpha Coin in one transaction and landed on its page");

  const bidder = await openAs(browser, BIDDER, "bidder");
  await open(bidder, "#/");
  await waitText(bidder, "Alpha Coin");
  await bidder.screenshot({ path: path.join(OUT, "2-market.png"), fullPage: true });
  step("bidder sees the listing on the market");

  await open(bidder, "#/launch/0");
  await bidder.locator("#bid-amount").fill("20");
  await waitText(bidder, "You receive at least");
  await clickButton(bidder, "Place bid");
  await waitText(bidder, "Bid confirmed");
  step("20 ETH bid confirmed");

  await bidder.locator("#bid-amount").fill("100");
  await waitText(bidder, "This bid sells out the auction");
  await bidder.screenshot({ path: path.join(OUT, "3-sellout-preview.png"), fullPage: true });
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
  if (!result.includes("1,000 ALP")) await fail(bidder, `Unexpected result card:\n${result}`);
  await bidder.screenshot({ path: path.join(OUT, "4-settled.png"), fullPage: true });
  step("result card shows 1,000 ALP sold, under the listing's own symbol");

  // A second listing that nobody buys out: it expires, settles at the reserve, and burns the rest
  await open(seller, "#/create");
  await fillLaunch(seller, { name: "Beta Coin", symbol: "BET", supply: "1000", start: "0.05", reserve: "0.01" });
  await clickButton(seller, "Launch token and start the auction");
  await waitText(seller, "Beta Coin");

  await open(bidder, "#/launch/1");
  await waitText(bidder, "Beta Coin");
  await bidder.locator("#bid-amount").fill("5");
  await waitText(bidder, "You receive at least");
  await clickButton(bidder, "Place bid");
  await waitText(bidder, "Bid confirmed");
  await rpc("evm_increaseTime", [1201]);
  await rpc("evm_mine");
  await waitText(bidder, "Settle auction");
  await clickButton(bidder, "Settle auction");
  // Settling replaces this card with the result, so the result is the confirmation
  await waitText(bidder, "Tokens burned");
  const burned = await bidder.evaluate(() => document.querySelector(".card-result").innerText);
  if (!burned.includes("500 BET")) await fail(bidder, `Expected 500 BET sold and 500 burned:\n${burned}`);
  step("second listing expired, settled at the reserve, burned 500 BET, and left the first listing alone");

  await open(bidder, "#/portfolio");
  await waitText(bidder, "Beta Coin");
  await waitText(bidder, "READY TO CLAIM"); // Uppercased by CSS, and innerText reports it that way
  await bidder.screenshot({ path: path.join(OUT, "5-portfolio.png"), fullPage: true });
  const portfolio = await bidder.evaluate(() => document.querySelector(".card-my-bids").innerText);
  if (!portfolio.includes("Alpha Coin") || !portfolio.includes("Claimed")) {
    await fail(bidder, `Portfolio is missing a bid:\n${portfolio}`);
  }
  step("bidder's portfolio lists bids across both listings");

  const curator = await openAs(browser, CURATOR, "curator");
  await waitText(curator, "Curator");
  await open(curator, "#/launch/1");
  await waitText(curator, "Hide from market");
  await clickButton(curator, "Hide from market");
  await waitText(curator, "Hide confirmed");
  await clickButton(curator, "Mark as verified");
  await waitText(curator, "Verify confirmed");
  step("curator hid and verified a listing");

  // A hidden listing leaves the market for everyone else, but its own page still works
  await open(bidder, "#/");
  await waitText(bidder, "Alpha Coin");
  await waitGone(bidder, "Beta Coin");
  await open(bidder, "#/launch/1");
  await waitText(bidder, "Hidden");
  await waitText(bidder, "Claim tokens");
  await clickButton(bidder, "Claim tokens");
  await waitText(bidder, "Claim confirmed");
  step("hidden listing left the market, and its bidder could still claim");

  await bidder.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await expectNoHorizontalScroll(bidder, "Listing page");
  await bidder.screenshot({ path: path.join(OUT, "6-listing-mobile.png"), fullPage: true });
  for (const [hash, name, wait] of [
    ["#/", "Market", "Alpha Coin"],
    ["#/create", "Create page", "Your token"],
    ["#/portfolio", "Portfolio", "Your bids"],
  ]) {
    await open(bidder, hash);
    await waitText(bidder, wait);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expectNoHorizontalScroll(bidder, name);
  }
  await open(bidder, "#/");
  await waitText(bidder, "Alpha Coin");
  await bidder.screenshot({ path: path.join(OUT, "7-market-mobile.png"), fullPage: true });
  step("no horizontal scroll on any page at 390px");

  if (problems.length) throw new Error(`Console errors:\n${problems.join("\n")}`);
  console.log(`Passed. Screenshots in ${OUT}`);
} finally {
  await browser.close();
}
