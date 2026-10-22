# NTU Token Launch: Uniform-Price Dutch Auction

SC4053 Blockchain Technology development project, Option 2. An ERC20 token launch where bidders commit Ether
while the price falls for 20 minutes. Everyone pays the same clearing price, and unsold tokens are burned.

The full rules, mapped clause by clause to the project brief, are in [spec.md](spec.md).

## How it works

1. The seller deploys `NTUToken` and `DutchAuction`, then calls `start()`. This pulls the sale supply into the
   auction and starts the 20-minute clock.
2. The price falls linearly from the start price to the reserve price. Bidders commit ETH with `bid()`.
3. The auction clears as soon as the committed ETH buys the whole supply at the current price. The bid that
   crosses that line is accepted only up to the remaining room, and its surplus is refunded in the same transaction.
4. If 20 minutes pass first, the auction settles at the reserve price and the unsold tokens are burned.
5. Every bidder claims `commitment ÷ clearing price` tokens. The seller withdraws exactly the ETH committed.

## Repository layout

| Path | Contents |
| --- | --- |
| `contracts/` | `DutchAuction.sol`, `NTUToken.sol`, and the test-only `ReentrancyAttacker.sol` |
| `test/` | Contract tests (unit, reentrancy, seeded random invariants) and tests for the CLI tasks |
| `tasks/auction.js` | Hardhat tasks to deploy and operate the auction, locally or on Sepolia |
| `frontend/` | React web app (Vite, wagmi, viem, RainbowKit), its unit tests and an end-to-end UI test |
| `deployments/` | Addresses and ABIs per network, written by `auction:deploy` (`sepolia.json` is committed) |
| `audit/` | AI Audit Report material: evidence logs, the AI issue log, the issues report |
| `prompts/` | Prompt logs for each AI-assisted session |

## Setup

Requires Node.js (tested on 24.11.0) and npm. Slither is optional, for static analysis.

```bash
npm install
npm test            # 34 tests
npm run coverage    # DutchAuction.sol: 100% lines, 97% branches
npm run slither     # needs Slither installed (pip install slither-analyzer)
```

## Local demo

Use two terminals.

```bash
# Terminal 1: a local chain with 20 funded accounts
npm run node

# Terminal 2: deploy a fresh auction and play a scenario
npm run demo:local                                                    # "live": two bids, auction left running
npx hardhat auction:demo --scenario soldout --network localhost       # bridging bid sells it out at 0.06 ETH
npx hardhat auction:demo --scenario expiry --network localhost        # time runs out, 750 NTU burned
```

Local prices default to a 0.1 ETH start and a 0.02 ETH reserve for 1,000 NTU. The demo skips chain time forward,
so nobody waits 20 minutes. To drive the auction by hand:

```bash
npx hardhat auction:status --network localhost
npx hardhat auction:bid --eth 10 --from 1 --network localhost         # --from = account index
npx hardhat auction:advance --seconds 300 --network localhost         # local only
npx hardhat auction:finalize --network localhost
npx hardhat auction:claim --from 1 --network localhost
npx hardhat auction:withdraw --network localhost
```

To use MetaMask against the local chain, add a network with RPC `http://127.0.0.1:8545` and chain ID `31337`.
Then import one of the test accounts printed by `npm run node`. Those keys are public; never send real funds to them.

## Web app

The frontend lives in `frontend/` and reads contract addresses from `deployments/*.json`, so it picks up every
new deployment automatically.

```bash
npm --prefix frontend install    # first time only
npm run frontend                 # http://localhost:5173
```

With `npm run node` and `npm run demo:local` running, the page shows the live auction. Connect MetaMask (on the
local network, chain ID 31337) or switch to Sepolia once it is deployed there. Features:

- **Live price and countdown**, computed every second from chain time with the contract's own formula.
- **A price chart** that shows the falling price, the bids so far, and the committed-capital line: the auction
  sells out where the two lines meet.
- **A bid form** that previews how much ETH is accepted, how much is refunded immediately, and the minimum tokens
  you receive.
- **Your position and claims**, a **settle** button once bidding ends, and a **seller panel** to start the auction
  and withdraw proceeds.
- **An activity feed** of every bid, settlement, claim and withdrawal, linked to Etherscan on Sepolia.

Optional settings go in `frontend/.env` (see `frontend/.env.example`): a WalletConnect project ID for mobile
wallets, and a custom Sepolia RPC URL.

```bash
npm --prefix frontend test         # unit tests for the client-side auction maths
npm --prefix frontend run build    # type-check and production build
npm --prefix frontend run e2e      # full lifecycle through the UI (needs the node and the dev server running)
```

The end-to-end test deploys a fresh auction and drives it through headless Edge or Chrome with an injected test
wallet: the seller starts it, a bidder bids, a second bid sells it out with a refund, the bidder claims, and the
seller withdraws.

## Sepolia testnet

1. **Create a throwaway wallet** in MetaMask, used only for this project. Never use a wallet that holds real funds.
2. **Fund it** with Sepolia test ETH from a faucet, such as Google Cloud's Web3 faucet. About 0.05 ETH is enough.
3. **Get an Etherscan API key** at etherscan.io (My Account → API Keys), for contract verification.
4. **Store the secrets** in Hardhat's per-user vars store. They are kept outside this repository:

   ```bash
   npx hardhat vars set SEPOLIA_PRIVATE_KEY     # the throwaway wallet's private key
   npx hardhat vars set ETHERSCAN_API_KEY
   npx hardhat vars set SEPOLIA_RPC_URL         # optional; defaults to a public Sepolia RPC
   ```

5. **Deploy, verify and start:**

   ```bash
   npm run deploy:sepolia    # deploys both contracts, verifies them on Etherscan, writes deployments/sepolia.json
   npm run start:sepolia     # approves the supply and starts the 20-minute clock
   npm run status:sepolia
   ```

Faucets give out little ETH, so Sepolia prices default to a 0.00005 ETH start and a 0.00001 ETH reserve for
1,000 NTU. Selling out then costs between 0.01 and 0.05 ETH. Override the defaults with
`--supply`, `--start-price` and `--reserve-price` on `auction:deploy`. The other tasks work on Sepolia too,
except `auction:advance` and `auction:demo`, because real chain time cannot be skipped.

Commit `deployments/sepolia.json` after deploying. It records the addresses, transaction hashes and ABIs that the
frontend and the audit report refer to.

## How the brief's "tricky points" are handled

| Tricky point | Approach |
| --- | --- |
| Block-based countdown and continuous price decay | The price is computed from `block.timestamp` on every call, multiplying before dividing, so there is no stored state to update and no rounding drift. |
| Claims when a bid bridges the clearing threshold | The bridging bid is accepted only up to the ETH needed to buy the remaining supply. The auction finalizes in the same transaction, and the surplus is refunded. |
| Safe ETH refunds against reentrancy | The bridging refund is the only refund path. State is written before the transfer, and `bid`, `claim` and `withdrawProceeds` are `nonReentrant`. A test attacker contract tries to re-enter every function and fails. |
| Permanently burning unsold tokens | The auction calls `ERC20Burnable.burn` on its own unsold balance, which lowers `totalSupply`. Tests assert the new supply. |

## AI Audit Report material

v1 (commits `138f1ce` to `ef71e56`) was written by hand before any AI tool was used. Later work was AI-assisted
with Claude Code. See `audit/ai-issues.md` for the AI's mistakes, `audit/evidence/` for test, coverage and
Slither logs, and `prompts/` for the prompt logs.
