# AI Issue Log

Mistakes made by AI tools in this project, in the brief's Major Issue Breakdown format (section 2.2).
This log feeds AI Audit Report section 5.

**Provenance:** v1 (`spec.md`, `NTUToken.sol`, `DutchAuction.sol`, `ReentrancyAttacker.sol`, `test/DutchAuction.test.js`;
commits `138f1ce`, `5f6a2c4`, `ef71e56`) was written by hand, before any AI tool was used. Its 13 issues are review
findings on the human baseline (see `evidence/2026-10-22-findings.md`), not AI mistakes. Everything from v2 onwards
was produced with Claude Code, starting in session 01 (2026-10-22).

| # | Issue | Severity | Session | Status |
| --- | --- | --- | --- | --- |
| AI-1 | v2 prototype over-allocates tokens when the clearing price rounds down | High | 01 | Fixed |
| AI-2 | Stated an unverified guess (that v1 was AI-written) as fact in the audit material | High (process) | 01 | Fixed |
| AI-3 | Wrong arithmetic in the Slither timestamp triage | Low | 01 | Fixed |
| AI-4 | Appended to `.gitignore` without a newline, merging two rules | Low | 01 | Fixed |
| AI-5 | Blamed a library for a crash it did not cause, in a code comment | Low | 01 | Fixed |
| AI-6 | Status output claimed a "guaranteed minimum" that is false once sold out | Medium | 01 | Fixed |

## AI-1: Rounding over-allocation in claims

- **Why the AI made the mistake:** it computed each bidder's tokens as `commitment × 1e18 / clearingPrice`, assuming
  the shares would add up to at most the supply. But `clearingPrice` is itself rounded down, so each share is
  slightly too large. The AI validated the prototype with 3 tests that used only round numbers, where no rounding
  occurs, and reported "3 of 3 passing" as evidence.
- **Why it is problematic:** when the auction sells out by the clock, the claims add up to more than the contract
  holds, and the last bidder's claim reverts with `ERC20InsufficientBalance`. Their tokens are stuck. In the test,
  the shortfall was 2,263 token-wei.
- **How it was fixed:** claims became a pro-rata share of the tokens sold, `commitment × tokensSold / totalCommitted`,
  which can never add up to more than `tokensSold`. A targeted test with odd bid amounts was added
  ("never pays out more than tokensSold when the clearing price rounds down").
- **Evidence:** mutation M7 (the old formula) passed all 28 tests before the targeted test existed, and fails it
  afterwards. See `evidence/2026-10-22-findings.md` and `evidence/2026-10-22-v2-test-run.txt`.

## AI-2: Unverified authorship claim

- **Why the AI made the mistake:** it inferred that v1 was AI-generated from the brief's framing (an audit of
  AI-generated code), from commit timestamps (3 commits in 11 minutes), and from code patterns. None of these shows
  how code was written. It wrote the guess into the report as fact ("the AI copied…", "a hallucinated idiom")
  without asking.
- **Why it is problematic:** the AI Audit Report is assessed work. Attributing hand-written code to AI would
  misrepresent the team's work, misframe report sections 1, 4 and 5, and undermine the credibility of the whole
  audit.
- **How it was fixed:** the user challenged the claim. The AI traced every mention, rewrote the root causes in
  neutral terms, renamed the `ai-baseline` tag to `v1-baseline`, and recorded provenance at the top of this log and
  in `spec.md`.
- **Evidence:** the report doc's revision history (rev 24 → 50; snapshot in `2026-10-22-issues-report.md`), the prompt log (prompts 3 and 4), and this log.
- **Prevention:** facts about provenance, intent or authorship come from the team, never from inference.

## AI-3: Arithmetic error in the Slither triage

- **Why the AI made the mistake:** it estimated the price change per second of timestamp skew as 0.0002 ETH without
  computing it.
- **Why it is problematic:** it overstated miner-manipulation risk by about 3× in a security justification.
- **How it was fixed:** the AI caught it on self-review before handing over: 0.08 ETH ÷ 1200 s ≈ 0.0000667 ETH per
  token per second.
- **Evidence:** `evidence/2026-10-22-findings.md`, Slither triage table, `timestamp` row.

## AI-4: Broken `.gitignore` entry

- **Why the AI made the mistake:** it appended lines with `printf` without checking that the file ended in a newline.
  The original `.gitignore` did not, so `.DS_Store` and `deployments/hardhat.json` became one line.
- **Why it is problematic:** neither rule matched any more. `.DS_Store` files and local deployment files would have
  been committed.
- **How it was fixed:** the AI noticed `deployments/` showing as untracked, inspected the file with `cat -A`, and
  split the line, keeping the file's CRLF line endings.
- **Evidence:** `git status` no longer lists `deployments/`.

## AI-5: Misdiagnosed exit crash

- **Why the AI made the mistake:** `auction:advance` crashed on exit with a libuv assertion under Node 24 on Windows.
  The AI assumed `@nomicfoundation/hardhat-network-helpers` was the cause, replaced it, and wrote that claim into a
  code comment before testing it. The crash continued.
- **Why it is problematic:** a wrong root cause in a comment misleads future readers. The crash also returned exit
  code 127, which breaks chained commands such as `deploy && start`.
- **How it was fixed:** the AI isolated the cause by running the same RPC calls as scripts, which all exited cleanly.
  The crash only happens when a CLI task exits the instant its last RPC response arrives. A 200 ms pause before
  exiting fixes it, and the comment now states the real cause.
- **Evidence:** 5 of 5 consecutive `auction:advance` runs exit with code 0.

## AI-6: False "guaranteed minimum" in status output

- **Why the AI made the mistake:** it reasoned that the clearing price can only fall, so `commitment ÷ current price`
  is a minimum. That holds only until the auction sells out. After that, the clearing price is fixed at or above
  the current price.
- **Why it is problematic:** a bidder could have been shown more tokens than they will actually receive.
- **How it was fixed:** caught on self-review before running. Sold-out auctions now show the pro-rata share,
  `commitment × supply ÷ totalCommitted`.
- **Evidence:** in the local end-to-end run, the status output showed 157.068 NTU for Alice after sell-out, and her
  claim transferred exactly 157.068062827225130067 NTU.
