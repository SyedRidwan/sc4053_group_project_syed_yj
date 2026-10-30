# AI Audit Report: Horton's Launchpad (SC4053 Option 2)

**Status: draft.** Lines marked **[TEAM]** need the team's own words or facts. They concern who did what and what the
team thinks, which an AI tool cannot truthfully supply. Everything else cites a file in this repository.

Provenance used throughout:

| Work | Produced by | Source |
| --- | --- | --- |
| v1: `spec.md`, contracts, tests (commits `138f1ce`, `5f6a2c4`, `ef71e56`) | Written by hand, before any AI tool | Team statement, `prompts/2026-10-22-session-01.md` |
| v2 onwards, on `feat/v2-committed-capital`, then `soln-combined` | Claude Code, directed by the operator | `prompts/` |
| `dutch-auction-token-launch` branch (commit `792b50d`) | An AI tool; which one is not recorded | Team statement, `ai-issues.md` |
| Launchpad: `LaunchFactory.sol`, the Market, Create and Portfolio pages, seed and demo tooling | Claude Code, directed by the operator | `prompts/2026-10-30-session-04.md` |

## 1. Initial Specification & System Scope

Before any AI tool was used, the team wrote a specification (`git show 138f1ce:spec.md`), contracts and four tests:

- **Token:** an ERC20 with 18 decimals and burn support.
- **Auction:** linear price decay from a start price to a reserve over 20 minutes, a bridging-bid partial fill, uniform
  clearing settlement, and burning of unsold tokens.
- **Allocation rule in v1:** each bid locked in tokens at the instantaneous price.

**[TEAM]** The intended UI features before AI was used. v1 contains no frontend and no written UI plan.

## 2. Development Methodology & AI Tooling Infrastructure

| Layer | Tools |
| --- | --- |
| AI coding agent | Claude Code (VS Code extension), model Claude Opus 5.5 |
| AI orchestration | Multi-agent workflows in session 04: separate agents read code, reproduced behaviour on throwaway chains, and tried to refute each other's conclusions |
| Contracts | Solidity 0.8.24, Hardhat 2, OpenZeppelin Contracts 5 |
| Frontend | React 19, Vite 8, wagmi 2, viem, RainbowKit 2 |
| Validation | Mocha/Chai, solidity-coverage, Slither, Vitest, a Puppeteer end-to-end test, manual mutation testing |
| Automation | GitHub Actions: contract tests, coverage, Slither gate, frontend tests and build, end-to-end test |

Custom artefacts built to direct the AI: `spec.md` (a brief-clause-to-rule table plus coding rules for AI tools), the
prompt logs in `prompts/`, and the issue log in `audit/ai-issues.md`.

**Division of labour and decision-making:** the operator set direction and made these recorded decisions: strict
adherence to the brief's clearing rule, combining the two branches, the token name, the launchpad scope, dropping
Sepolia in favour of a local deployment. The AI wrote the code and tests and proposed options.

**[TEAM]** How work was split between team members, and who reviewed what.

## 3. Specification Engineering & Prompt Logs

**Formal specification:** `spec.md` v2 maps every clause of the brief to a rule, lists invariants that tests enforce,
and sets coding rules for AI tools (multiply before divide, checks-effects-interactions, `SafeERC20`, never pay out
`address(this).balance`). It replaced v1's allocation rule after the review below.

**Representative prompt chains** (full logs in `prompts/`):

1. **From failure to redesign (session 01).** "Please run and analyse my current project and compile a report of the
   current issues…" → 0 of 4 tests passing, 3 hidden money bugs found by probes → "I want to adhere to the brief
   strictly" → committed-capital rewrite.
2. **Correcting the AI (session 01).** "I think you're mistaken, where and how did you infer that the first version was
   done by AI?" → the AI admitted it had no evidence and corrected the report (AI-2).
3. **Comparing implementations (session 03).** "Please conduct a thorough analyse of the branch named
   'dutch-auction-token-launch' and compare…" → the same bids run against both contracts, and the better design kept.
4. **Symptom to root cause (session 03).** "why do i keep getting these?" with a CI screenshot → a race condition in the
   transaction hook (AI-17).
5. **Testing a scope change (session 04).** See section 7.

Context given to the tool is listed at the top of each log. The brief's PDF was supplied in session 01.

## 4. AI-Generated Architecture

The AI's v2 design replaced v1's per-bid allocation:

- **`HortonsToken`** (then `NTUToken`): fixed-supply ERC20 with `ERC20Burnable`.
- **`DutchAuction`:** `immutable` parameters, a stateless price function, and these state transitions:
  `start()` → `bid()`* → `_finalize()` (on the bridging bid, or via `finalize()`/`claim()` after expiry) → `claim()`* and
  `withdrawProceeds()`.
- **Clearing:** sold out when `totalCommitted ≥ S × P(t) / 1e18`; `P_clear = max(P_reserve, totalCommitted × 1e18 / S)`.
- **Claims:** a pull pattern with pro-rata shares, so there is no loop over bidders.
- **Frontend:** a read-only snapshot hook polled every 4 seconds, client-side copies of the price maths for per-second
  updates, and one card component per concern.

The AI's launchpad design (session 04) wraps that auction without changing it:

- **`LaunchFactory`:** `createLaunch` deploys a token and an auction with `new`, then starts the auction. Because the
  auction sets `seller = msg.sender`, the factory is the on-chain seller, and `withdrawProceeds(id)` forwards to the
  registered seller.
- **Design choice:** the AI built and measured two versions. EIP-1167 clones made each launch 3.4 times cheaper in gas, but
  needed 35 added and 7 removed lines in the audited auction, plus a new token. It chose plain `new`, which changes neither.
- **Registry:** paged views return one row per listing, so the site has no backend or event indexer.
- **Roles:** derived from the wallet and chain data, with no accounts or login.

## 5. Problems Discovered & Vulnerability Analysis

The full inventory, each entry in the brief's 4-part format, is in [`ai-issues.md`](ai-issues.md). Most significant:

| Issue | Impact | Status |
| --- | --- | --- |
| AI-1: claims over-allocated when the clearing price rounds down | The last bidder's claim reverts and their tokens are stuck | Fixed, test added |
| AI-2, AI-16: stated unverified authorship as fact | Misrepresents assessed work | Fixed, prevention rule recorded |
| AI-10: per-bid allocation contradicts the brief | Same bids paid the seller 166.67 ETH instead of 600 ETH | Not carried over |
| AI-11: missing dependency | A fresh clone does not compile | Not carried over |
| AI-12: clock starts before funding | ETH locked permanently (probe P3) | Not carried over |
| AI-13: proceeds depend on bidders claiming | A non-claiming bidder holds back the seller's ETH | Not carried over |
| AI-17: race in the transaction hook | Typed input wiped; CI failed intermittently | Fixed |
| AI-19: wrong claim from a truncated read of MetaMask's code | Would have ruled out the real cause of a false error | Fixed by an adversarial agent |
| AI-20: weak factory bounds in the prototype | A nearly flat "descending" price, and instant dust sell-outs | Fixed before reaching the repository |
| AI-21: no reentrancy guard on the seller forward | Broke the project's own spec | Fixed, test added |
| AI-22: tests that could not fail | False confidence, repeating AI-7 | Fixed, mutations added |

**Review of the hand-written v1 (a human baseline, not AI mistakes):** 13 issues, including double refunds, a seller
drain and reentrancy. See `2026-10-22-issues-report.md` and `evidence/2026-10-22-findings.md`.

## 6. Validation Process & Testing Strategy

| Method | Result | Evidence |
| --- | --- | --- |
| Unit, event, revert, reentrancy, isolation and seeded-random invariant tests | 81 passing, including the original 39 unchanged | `evidence/2026-10-30-launchpad-test-run.txt` |
| Coverage | `LaunchFactory.sol` 100% lines and branches; `DutchAuction.sol` 100% lines, 96.97% branches | `evidence/2026-10-30-launchpad-coverage.txt` |
| Slither | 30 results, none high severity, all triaged | `evidence/2026-10-30-launchpad-slither.txt`, triage in `evidence/2026-10-30-launchpad-findings.md` |
| Mutation testing | Auction: 9 of 9 caught, one only after adding a test (AI-1). Factory: 14 of 14, two only after adding tests (AI-21, AI-22) | `evidence/2026-10-22-findings.md`, `evidence/2026-10-30-launchpad-mutations.txt` |
| Frontend unit tests | 36 passing, with form validation matched to the contract's bounds | `frontend/src/lib/` |
| Differential testing of the two branches | Probes P1 to P3 | `evidence/2026-10-28-probes/` |
| End-to-end test through the real UI | 17 steps across three listings and three wallets, with an injected test wallet | `frontend/e2e/lifecycle.mjs`, `evidence/2026-10-30-launchpad-e2e.txt`, `evidence/2026-10-30-ui/` |
| Local deployment with MetaMask | Single-auction site: bids, sell-out with refund, claims (prompt logs, sessions 02 to 04) | **[TEAM]** Confirm the launchpad with real MetaMask; this has not been done |

Slither missed most of v1's serious bugs, which were logic errors, so tests written against the brief's rules did more
than static analysis here.

**Reentrancy (the brief's bonus):** `ReentrancyAttacker.sol` re-enters during the refund, and `ReentrantSeller` re-enters
the factory during a withdrawal. The tests show one attempt each, no successes, and correct balances.

**Limit of this evidence:** the MetaMask diagnosis in session 04 rests on reading the extension's code and on the operator's
report that the error stopped. It was not reproduced end to end in a real extension.

## 7. Improvements & Refinements

Changes beyond the base AI output, and who originated them:

- **Operator:** required strict adherence to the clearing rule, which rejected the v1 model and the other branch's.
- **Operator:** found that live numbers made the overview cards jump, which led to the fixed-height fix.
- **Operator:** challenged the AI's authorship claim (AI-2).
- **Operator:** asked to go beyond a single auction to multiple tokens; the AI evaluated this against the rubric and
  narrowed it to a launchpad.
- **Operator:** chose a local deployment over Sepolia, on the basis of the submission instructions, and required a
  website-only demo.
- **AI, after review:** pro-rata claims (AI-1), and the correction of two spec invariants that were false as written
  (forced ETH and dust bids, spec section 4).

The operator also reviewed the launchpad and required a live portfolio tracker, tokens added to the wallet on claim, more
explanation for users, and a redesign with a light theme, on the grounds that the first version looked "AI-generated".

The launchpad itself is AI output, so its code belongs in sections 3 to 5, not here. Only the scope decisions above are the
team's.

**[TEAM]** Any changes the team made by hand, and any manual code review it did.

## 8. Lessons Learned

Observations recorded in the logs:

- **Where AI excelled:** producing probes and tests quickly, comparing designs by experiment, and tracing symptoms
  through unfamiliar code, including a browser extension's bundle in session 04.
- **Where AI failed:** stating guesses as facts (AI-2, AI-16, AI-15), writing tests that passed for the wrong reason
  (AI-1, AI-7), and hard-coding facts from memory (AI-9). Its own passing tests were not good evidence until mutation
  testing challenged them.
- **What worked:** a spec that quotes the brief, keeping a log of AI mistakes, and asking separate agents to refute a
  conclusion. In session 04 this overturned a claim that had looked proven.

**[TEAM]** The team's own critical evaluation and recommendations. This section is meant to be the team's judgement, so
please write it yourselves.
