// One command for the whole local demo: starts the chain, seeds the market, and serves the site.
// Usage: npm run demo [-- --expires-in 240]. Stop it with Ctrl+C.

const { spawn, spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RPC = "http://127.0.0.1:8545";
const APP = "http://localhost:5173";
const START_TIMEOUT_MS = 60000;

const children = [];

function start(command, args) {
  const child = spawn(command, args, { cwd: ROOT, shell: true, stdio: ["ignore", "ignore", "inherit"] });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    // A shell owns the real process, so the whole tree has to go on Windows
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill();
  }
}

async function chainIsUp() {
  try {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await chainIsUp()) {
    throw new Error(`Something is already using ${RPC}. Stop it first, because seeding needs a fresh chain.`);
  }

  console.log("Starting the local chain…");
  start("npx", ["hardhat", "node"]);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(await chainIsUp())) {
    if (Date.now() > deadline) throw new Error("The local chain did not start within a minute");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("Seeding the market…");
  const seedArgs = ["hardhat", "launchpad:seed", "--network", "localhost", ...process.argv.slice(2)];
  const seed = spawnSync("npx", seedArgs, { cwd: ROOT, shell: true, stdio: "inherit" });
  if (seed.status !== 0) throw new Error("Seeding failed");

  console.log("Starting the site…");
  start("npm", ["--prefix", "frontend", "run", "dev", "--", "--port", "5173", "--strictPort"]);

  console.log(`\nReady: ${APP}`);
  console.log("Add the local network to MetaMask (RPC http://127.0.0.1:8545, chain ID 31337) and import test accounts");
  console.log("from the README. Then run \"Clear activity and nonce data\" for each one before sending anything.");
  console.log("Press Ctrl+C to stop.\n");
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

main().catch((err) => {
  console.error(err.message);
  stopAll();
  process.exit(1);
});
