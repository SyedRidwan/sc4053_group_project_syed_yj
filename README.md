# Horton's Launchpad: Fair-Price Dutch Auction Token Launches

SC4053 Blockchain Technology development project, Option 2. Anyone can launch an ERC20 token from the website. Every
token sells in its own 20-minute Dutch auction: bidders commit Ether while the price falls, everyone pays the same
clearing price, and unsold tokens are burned.

The full rules, mapped clause by clause to the project brief, are in [spec.md](spec.md).

## Run it

Requires Node.js (tested on 24.11.0) and npm.

```bash
npm install
npm --prefix frontend install
npm run demo
```

`npm run demo` starts a local chain, deploys the factory, fills the market with sample listings, and serves the site at
**http://localhost:5173**. Press Ctrl+C to stop it. It needs port 8545 and port 5173 to be free.

Each run starts from a fresh chain with six listings:

| Listing | State |
| --- | --- |
| Horton's (TIM) | Live, verified, with the full 20 minutes left. This is the main listing. |
| Nova (NOVA) | Live, and expires about 4 minutes after seeding, so you can watch the burn. Change this with `npm run demo -- --expires-in 300` (30 to 600 seconds). |
| Meridian (MRD) | Live and about halfway through, with room for a bid to sell it out and be refunded. |
| Free Money (FREE) | Live and misleading, for the curator to hide. |
| Aurora (AUR) | Sold out and settled, with proceeds waiting for its seller. |
| Cobalt (COB) | Expired and settled at the reserve, with its unsold half burned. |

### Connect MetaMask

1. Add a network with RPC URL `http://127.0.0.1:8545`, chain ID `31337` and currency `ETH`.
2. Import these Hardhat test accounts. **Their keys are public, so never send real funds to them.**

| Use it as | Account | Private key |
| --- | --- | --- |
| Curator | #0 `0xf39F…2266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Seller of Aurora, Meridian and Horton's | #1 `0x7099…79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Buyer (no seeded activity) | #3 `0x90F7…b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

3. **After every restart of the chain:** select the local network in MetaMask and run Settings > Advanced > "Clear
   activity and nonce data" for each account, before sending anything. Restarting resets the chain, so new transactions
   reuse the nonces of confirmed ones MetaMask still remembers. MetaMask can then show "Transaction failed" for a
   transaction that succeeded. The site's own status line reads the real result from the chain.

## How it works

1. A seller fills in the Launch form. One transaction to `LaunchFactory` creates the token and its auction, moves the
   whole supply into the auction, and starts its 20-minute clock.
2. The price falls linearly from the start price to the reserve. Bidders commit ETH with `bid()`.
3. The auction clears as soon as the committed ETH buys the whole supply at the current price. The bid that crosses that
   line is accepted only up to the remaining room, and its surplus is refunded in the same transaction.
4. If 20 minutes pass first, the auction settles at the reserve price and the unsold tokens are burned.
5. Every bidder claims their share at the one clearing price. The seller withdraws exactly the ETH committed.

### Who can do what

There are no sign-ups. The wallet is the identity, and the site works out each role from it.

| Role | Who | Can |
| --- | --- | --- |
| Visitor | No wallet connected | Browse the market and every listing |
| Bidder | Any wallet | Bid, settle, and claim tokens; see them on the Portfolio page |
| Seller | The wallet that created a listing | Everything above, plus withdraw that listing's proceeds |
| Curator | One fixed address, set at deployment | Hide a listing from the market, or mark it verified |

The curator **cannot** touch funds, prices or running auctions, and a hidden auction keeps running. Both are tested.

### Pages

- **Market:** a live chart of every coin's falling price, a price ticker, search, sorting and filters.
- **Listing:** a price chart with bids and the sell-out point, a bid form that previews your refund, your position, and
  an "Under the hood" panel showing the contract's sums with live numbers.
- **Portfolio:** a live tracker for every coin you've bid on, launched or starred, with your projected outcome. You can bid,
  settle, claim and withdraw from there.
- **Launch a token:** a form that checks your values and previews the launch before your wallet opens.
- **How it works:** an interactive auction simulator, the contract design, the safety measures and common questions.

Claiming also asks your wallet to add the token. A wallet always asks its owner to approve this, and no site can skip it.
The site has light and dark themes, and starts with your system's preference.

## Repository layout

| Path | Contents |
| --- | --- |
| `contracts/` | `LaunchFactory.sol`, `DutchAuction.sol`, `HortonsToken.sol`, and the test-only `ReentrancyAttacker.sol` and `LaunchTestHelpers.sol` |
| `test/` | Contract tests: unit, isolation, reentrancy, curator limits, seeded random invariants, and tasks |
| `tasks/` | `launchpad.js` deploys and seeds the market. `auction.js` operates one standalone auction from the command line. |
| `scripts/demo.js` | The `npm run demo` command |
| `frontend/` | React web app (Vite, wagmi, viem, RainbowKit), unit tests and an end-to-end UI test |
| `deployments/` | Addresses written at deployment (git-ignored, because local addresses change) |
| `audit/` | [AI Audit Report](audit/ai-audit-report.md), [AI issue log](audit/ai-issues.md) and evidence |
| `prompts/` | Prompt logs for each AI-assisted session |
| `docs/` | The plan for the demo video |

## Tests

```bash
npm test                            # 87 contract tests
npm run coverage                    # 100% lines; 98% branches
npm run slither                     # needs Slither (pip install slither-analyzer)
npm --prefix frontend test          # 39 frontend unit tests
npm --prefix frontend run build     # type check and production build
npm --prefix frontend run e2e       # the whole site in a headless browser
```

The end-to-end test needs a chain and the site running (`npm run node` and `npm run frontend` in two terminals). It
launches three tokens through the form with an injected test wallet, then covers a sell-out with a refund, an expiry with a
burn, claims and the wallet request that follows, withdrawal, the live portfolio, the curator, the simulator, the theme, and
mobile layouts.

`.github/workflows/ci.yml` runs contract tests and coverage, Slither (failing on any high-severity finding), frontend
tests and build, and the end-to-end test on every push.

## How the brief's "tricky points" are handled

| Tricky point | Approach |
| --- | --- |
| Block-based countdown and continuous price decay | The price is computed from `block.timestamp` on every call, multiplying before dividing, so there is no stored state to update and no rounding drift. |
| Claims when a bid bridges the clearing threshold | The bridging bid is accepted only up to the ETH needed to buy the remaining supply. The auction finalizes in the same transaction, and the surplus is refunded. |
| Safe ETH refunds against reentrancy | The bridging refund is the only refund path. State is written before the transfer, and `bid`, `claim` and both `withdrawProceeds` functions are `nonReentrant`. Test attackers try to re-enter and fail. |
| Permanently burning unsold tokens | The auction calls `ERC20Burnable.burn` on its own unsold balance, which lowers `totalSupply`. Tests assert the new supply. |

## Operating one auction from the command line

`tasks/auction.js` deploys and drives a single auction without the factory. These use a separate deployment file, which
the website does not read.

```bash
npx hardhat auction:demo --scenario soldout --network localhost   # also: live, expiry
npx hardhat auction:status --network localhost
npx hardhat auction:bid --eth 10 --from 1 --network localhost
npx hardhat auction:advance --seconds 300 --network localhost
```

## AI Audit Report material

v1 (commits `138f1ce` to `ef71e56`) was written by hand before any AI tool was used. Later work was AI-assisted with
Claude Code. See the [report](audit/ai-audit-report.md), `audit/ai-issues.md` for the AI's mistakes, `audit/evidence/` for
test, coverage, mutation and Slither logs, and `prompts/` for the prompt logs.
