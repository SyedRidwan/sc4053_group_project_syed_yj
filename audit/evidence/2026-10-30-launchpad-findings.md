# Evidence: 2026-10-30 launchpad factory

Raw logs in this folder:

| File | What it shows |
| --- | --- |
| `2026-10-30-launchpad-test-run.txt` | Contract tests with the factory |
| `2026-10-30-launchpad-coverage.txt` | `LaunchFactory.sol` 100% lines and branches; `DutchAuction.sol` unchanged at 100% lines, 96.97% branches |
| `2026-10-30-launchpad-slither.txt` | 30 results, triaged below; none high severity |
| `2026-10-30-launchpad-mutations.txt` | 14 deliberate factory bugs and how many tests caught each |

## Mutation testing

Each mutation adds one bug to `LaunchFactory.sol`, and the factory tests run against it. On the first run, 12 of 14 were
caught. Two survived, which exposed gaps in the tests:

- **M2, `nonReentrant` removed.** The only re-entry test replayed the same launch, which the auction already blocks with
  "Already withdrawn". A new test re-enters for a second launch.
- **M13, page size not clamped.** The test used exactly 50 listings, so the clamp never applied. It now uses 51.

After those two tests, all 14 are caught.

## Slither triage

| Detector | Where | Verdict |
| --- | --- | --- |
| `unused-return` | `token.approve` in `createLaunch` | Accepted: the token is the factory's own OpenZeppelin ERC20, whose `approve` returns true or reverts |
| `calls-loop` | `getLaunches`, `getPositions` | Accepted: view functions only, calling contracts the factory itself deployed, with pages capped at 50 |
| `reentrancy-benign`, `incorrect-equality`, `timestamp`, `low-level-calls` | `DutchAuction`, and the ETH forward in `withdrawProceeds` | As triaged in `2026-10-22-findings.md`; the forward checks its result and is `nonReentrant` |

`ReentrancyAttacker.sol` and `LaunchTestHelpers.sol` are deliberately reentrant test contracts, and are excluded.
