# Evidence: 2026-10-28 comparison of the two implementations

This repository had two implementations of the brief on separate branches. This file compares them and records what
`soln-combined` takes from each. The comparison and the combined branch were produced with Claude Code in
session 03 (see `../../prompts/2026-10-28-session-03.md`).

| Branch | Commit | Contents |
| --- | --- | --- |
| `feat/v2-committed-capital` | `198e641` | Committed-capital auction (this repository's v2), Hardhat 2, ethers, Mocha |
| `dutch-auction-token-launch` | `792b50d` (author `yojin5`) | Separate implementation from its own root commit, Hardhat 3, viem, `node:test`, Ignition |

Both contracts share the same building blocks: OpenZeppelin `ERC20Burnable` and `ReentrancyGuard`, a 20-minute
linear decay computed multiply-before-divide, one uniform clearing price, burning of unsold tokens, and pull-based
claims. They differ in how a bid turns into tokens.

- **Committed capital (`feat/v2-committed-capital`):** a bid records ETH only. The auction sells out when
  `totalCommitted ≥ supply × P(t)`, and every bidder receives `commitment ÷ clearing price`.
- **Per-bid allocation (`dutch-auction-token-launch`):** a bid fixes `msg.value ÷ P(t)` tokens at that moment. The
  auction sells out when those fixed quantities add up to the supply. At claim, each bidder pays the clearing price
  for their fixed tokens and is refunded the rest. This is the allocation rule v1 used, with v1's double refund,
  seller drain, reentrancy and fake burn fixed.

## Probes: same scenarios against both contracts

Scripts and raw output are in `2026-10-28-probes/`. All probes use 1,000 tokens, a 1 ETH start price and a 0.2 ETH
reserve (the parameters of `dutch-auction-token-launch`). To re-run them:

- `per-bid-contract.probe.ts`: copy into `test/` of a checkout of `792b50d`, run
  `npm ci && npm i --no-save @openzeppelin/contracts@5`, then `npx hardhat test nodejs test/per-bid-contract.probe.ts`.
- `committed-capital-contract.probe.js`: from this repository's root,
  `npx hardhat test audit/evidence/2026-10-28-probes/committed-capital-contract.probe.js`.

| Probe | Per-bid allocation | Committed capital |
| --- | --- | --- |
| P1: Alice commits 400 ETH at 5 min (P = 0.8), Bob 200 ETH at 10 min (P = 0.6) | Never sells out. Expires at 0.2 ETH, burns 166.67 tokens, seller receives 166.67 ETH | Sells out in Bob's transaction at 0.6 ETH. Nothing burned, seller receives 600 ETH |
| P2: Alice bids, the auction expires, Alice has not claimed | Seller's withdrawal reverts ("No proceeds available"). Proceeds accrue only as bidders claim | Seller withdraws `totalCommitted` regardless of claims |
| P3: Auction deployed but never funded with tokens | Bid accepted. After expiry `finalizeAuction` and `claim` both revert, so the 100 ETH is locked | Not possible: `start()` pulls the supply before the clock starts, and bids before `start()` revert |

P1 is the key finding. With per-bid allocation, demand counts only at the price paid, so 600 ETH of willingness to
pay 0.6 ETH settles at the 0.2 ETH floor. The brief's rule is "when total committed capital meets total token
supply, the auction clears", which is the committed-capital condition. P1 is now a regression test in
`test/DutchAuction.test.js` ("sells out on committed capital where per-bid allocation would settle at the reserve"),
scaled to the suite's prices.

## Side-by-side

| Area | `feat/v2-committed-capital` | `dutch-auction-token-launch` | Combined |
| --- | --- | --- | --- |
| Clearing rule | Committed capital, as in the brief | Per-bid allocation (see P1) | Committed capital |
| Funding and start | `start()` pulls the supply, then starts the clock | Clock starts at deploy; tokens transferred afterwards (see P3) | `start()` |
| Bridging bid | Capped at the remaining room, surplus refunded in the same transaction | Capped by quantity, surplus refunded at claim | Same-transaction refund |
| Seller proceeds | Exactly `totalCommitted`, once | Sum of claimed costs (see P2) | `totalCommitted` |
| Builds from a fresh clone | Yes | No: `@openzeppelin/contracts` is missing from `package.json`, so `npm ci && npx hardhat compile` fails with HHE902 | Yes |
| Contract tests | 34 (unit, reentrancy, 10 seeded random invariant runs, CLI tasks) | 34 scenario tests (pass once OpenZeppelin is installed by hand) | 39 |
| Token tests | None | 6 (`AuctionToken.ts`) | 4, ported (`HortonsToken.test.js`) |
| Coverage, Slither, mutation testing | 100% lines, 96.97% branches; Slither triaged; 9 mutations | None | Kept |
| CI | Tests, coverage, Slither, frontend build, end-to-end UI | None | Kept |
| Deployment | Hardhat tasks; addresses and ABIs written to `deployments/<network>.json` for the frontend | Ignition module; six Sepolia deployments with journals; addresses hard-coded in scripts and the frontend | Tasks |
| Sepolia prices | 0.00005 to 0.00001 ETH, so a sell-out costs 0.01 to 0.05 test ETH | 1 to 0.2 ETH, so a sell-out costs 200 to 1,000 test ETH | Tasks' defaults |
| Frontend | wagmi and RainbowKit; live chart, bid preview, position, seller panel, activity feed; unit and end-to-end tests | One 1,009-line `App.tsx` with plain `window.ethereum`; hand-copied ABI; no tests | Kept |
| Docs and audit trail | Spec mapped to the brief, README, AI issue log, evidence, prompt logs | README and frontend README are the Hardhat and Vite templates; `ignition/modules/Counter.ts` deploys a contract that does not exist | Kept |
| Toolchain | Hardhat 2, solc 0.8.24 | Hardhat 3, solc 0.8.34, TypeScript tests | Hardhat 2 |

## What the combined branch takes from `dutch-auction-token-launch`

- **History:** `soln-combined` records `792b50d` as a merged parent, so the branch's work stays in the project
  history, including the six Sepolia deployment journals.
- **Token tests:** `test/AuctionToken.ts` ported to `test/HortonsToken.test.js` (named `NTUToken.test.js` before the token was renamed to Horton's), plus a check that nobody can burn
  tokens they neither hold nor were approved for.
- **The per-bid design as a counter-example:** probe P1, kept as a regression test.

## What it does not take, and why

- **The per-bid contract:** P1 to P3.
- **Hardhat 3:** the coverage, Slither, CI, task and frontend tooling all run on Hardhat 2. Moving would mean
  rewriting 39 tests and the tasks without changing what is assessed. It remains an option after submission.
- **Ignition:** the Hardhat tasks already deploy, verify, start and record each deployment where the frontend reads
  it. A second deployment path would duplicate them.
- **The Sepolia deployments:** they are of the per-bid contract, so they are not evidence for the combined one.

## Still to do

- Deploy the combined contracts to Sepolia (`npm run deploy:sepolia`, then `npm run start:sepolia`) and commit
  `deployments/sepolia.json`. `dutch-auction-token-launch` already has six Sepolia deployments, so a funded Sepolia setup exists.
