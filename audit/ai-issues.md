# AI Issue Log

Mistakes made by AI tools in this project, in the brief's Major Issue Breakdown format (section 2.2).
This log feeds AI Audit Report section 5.

**Provenance:** v1 (`spec.md`, `NTUToken.sol`, `DutchAuction.sol`, `ReentrancyAttacker.sol`, `test/DutchAuction.test.js`;
commits `138f1ce`, `5f6a2c4`, `ef71e56`) was written by hand, before any AI tool was used. Its 13 issues are review
findings on the human baseline (see `evidence/2026-10-22-findings.md`), not AI mistakes. Everything from v2 onwards
was produced with Claude Code, starting in session 01 (2026-10-22).
The `dutch-auction-token-launch` branch (commit `792b50d`) was produced with an AI tool, as confirmed by the team on
2026-10-28. It has no prompt log, so the causes given for AI-10 to AI-14 are read from the code.

| # | Issue | Severity | Session | Status |
| --- | --- | --- | --- | --- |
| AI-1 | v2 prototype over-allocates tokens when the clearing price rounds down | High | 01 | Fixed |
| AI-2 | Stated an unverified guess (that v1 was AI-written) as fact in the audit material | High (process) | 01 | Fixed |
| AI-3 | Wrong arithmetic in the Slither timestamp triage | Low | 01 | Fixed |
| AI-4 | Appended to `.gitignore` without a newline, merging two rules | Low | 01 | Fixed |
| AI-5 | Blamed a library for a crash it did not cause, in a code comment | Low | 01 | Fixed |
| AI-6 | Status output claimed a "guaranteed minimum" that is false once sold out | Medium | 01 | Fixed |
| AI-7 | End-to-end test reported "connected" while the wallet was still connecting | Medium | 01 | Fixed |
| AI-8 | Unreadable and overlapping chart on mobile; first fix made it worse | Medium | 01 | Fixed |
| AI-9 | Wrote package versions from memory that did not exist | Low | 01 | Fixed |
| AI-10 | Per-bid token allocation contradicts the brief's clearing rule | High | `792b50d` | Not carried over |
| AI-11 | `@openzeppelin/contracts` missing from `package.json`, so a fresh clone does not compile | High | `792b50d` | Not carried over |
| AI-12 | Auction clock starts at deploy, so an unfunded auction takes bids and then locks the ETH | High | `792b50d` | Not carried over |
| AI-13 | Seller proceeds accrue only as bidders claim | Medium | `792b50d` | Not carried over |
| AI-14 | Template READMEs, a module for a missing contract, and mismatched hard-coded addresses | Low | `792b50d` | Not carried over |
| AI-15 | Misread a root commit as a child of this branch from a `git log --graph` listing | Low | 03 | Fixed |
| AI-16 | Called a branch "the team's" without confirming who wrote it (repeat of AI-2) | Medium (process) | 03 | Fixed |
| AI-17 | Race in the frontend's transaction hook: a new bid typed just after "Bid confirmed" was wiped, making CI flaky | Medium | 01 | Fixed |

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

## AI-7: False-positive end-to-end assertion

- **Why the AI made the mistake:** to confirm a wallet had connected, the test waited for text ("ETH committed", then
  the account's first characters) that also appears on the page when no wallet is connected. The overview tile and
  the Contracts card show it regardless.
- **Why it is problematic:** the test logged "bidder: connected" while RainbowKit was still stuck on "Opening
  MetaMask…". A test that passes for the wrong reason gives false confidence, which is exactly what the audit is
  meant to catch.
- **How it was fixed:** the later "Place bid" step failed, and a screenshot showed the stuck modal. The check now
  waits for "NTU in wallet" in the position card, which only renders for a connected account. The test also
  connects through RainbowKit's "Browser Wallet" option: the "MetaMask" option goes through the MetaMask SDK, which
  expects the real extension.
- **Evidence:** `frontend/e2e/lifecycle.mjs` passes all 8 steps. Screenshots are in `evidence/2026-10-23-ui/`.

## AI-8: Mobile layout problems found only by screenshots

- **Why the AI made the mistake:** the chart was drawn at a fixed 640-unit size and scaled to fit, so on a 390 px
  phone its 12 px labels became about 6 px. The first fix enlarged the fonts inside the scaled drawing, and the
  labels then overlapped. Other issues: a "sells out at 18:45" label that read like a clock time, labels that
  collided or were clipped at the chart edge, and side cards that did not fill the screen width.
- **Why it is problematic:** the rubric's top band asks for "sleek UX". None of these problems show up in a type
  check, a build, or unit tests.
- **How it was fixed:** the chart now measures its container and draws at real pixel size, with a compact layout
  under 480 px. Labels pick the side of their point that has room. The countdown reads "sells out in 14:38". On
  mobile the action cards come before the chart, and the overview uses a 2×2 grid.
- **Evidence:** `evidence/2026-10-23-ui/3-settled-mobile.png`. The end-to-end test fails if the page scrolls
  horizontally at 390 px.

## AI-9: Package versions written from memory

- **Why the AI made the mistake:** it wrote `@types/react` 19.2.2 and `vitest` 4.1.4 into `frontend/package.json`
  from memory, without checking the registry. This is the "hallucinated versions or syntax" failure the brief
  names.
- **Why it is problematic:** the install would have failed or pulled outdated packages.
- **How it was fixed:** the AI checked every package with `npm view` before installing, and corrected them to
  19.3.0 and 5.0.5. The same check showed that RainbowKit 2.2.11 only supports wagmi 2, so wagmi is pinned to
  2.19.5 rather than 3.x.
- **Evidence:** `frontend/package.json` and `frontend/package-lock.json`.

## AI-10: Per-bid allocation instead of committed capital

- **Why the AI made the mistake:** `bid()` fixes each bid's tokens as `msg.value × 1e18 / getCurrentPrice()` and
  counts the auction as sold out only when those fixed quantities reach the supply. Early ETH is counted at the high
  price it was sent at, not as demand at the current price. The brief's rule is "when total committed capital meets
  total token supply, the auction clears". This is the same allocation rule as the hand-written v1.
- **Why it is problematic:** strong demand can fail to clear. In probe P1 (Alice 400 ETH at 5 min, Bob 200 ETH at
  10 min; 1,000 tokens, 1 to 0.2 ETH), the auction expires at the 0.2 ETH reserve, burns 166.67 tokens and pays the
  seller 166.67 ETH. Under the brief's rule it sells out at 0.6 ETH and pays 600 ETH.
- **How it was fixed:** not carried into `soln-combined`, which keeps the committed-capital contract. P1 is now a
  regression test ("sells out on committed capital where per-bid allocation would settle at the reserve").
- **Evidence:** `evidence/2026-10-28-branch-comparison.md` and `evidence/2026-10-28-probes/`.

## AI-11: Missing OpenZeppelin dependency

- **Why the AI made the mistake:** all three contracts import `@openzeppelin/contracts`, but neither `package.json`
  nor `package-lock.json` lists it. The package was presumably present in the local `node_modules` without being
  saved, so the tests passed on that machine.
- **Why it is problematic:** `npm ci && npx hardhat compile` on a fresh clone fails with HHE902 ("The package
  "@openzeppelin/contracts" is not installed"). A marker cannot build or test the branch.
- **How it was fixed:** not carried over; this branch declares `@openzeppelin/contracts` in `package.json`. For the
  comparison, the package was installed by hand in a scratch copy, after which the branch's 34 tests passed.
- **Evidence:** `evidence/2026-10-28-branch-comparison.md` (side-by-side table, "Builds from a fresh clone").

## AI-12: Clock starts before the auction is funded

- **Why the AI made the mistake:** the constructor sets `startTime = block.timestamp`, and the tokens are sent in a
  separate transaction afterwards (`m.call(token, "transfer", ...)` in the Ignition module). Nothing checks that the
  auction holds the supply before it accepts bids.
- **Why it is problematic:** in probe P3 an unfunded auction accepted a 100 ETH bid. After expiry, `finalizeAuction`
  reverts because it cannot burn tokens it does not hold, and `claim` reverts because the auction never finalizes,
  so the ETH is locked for good. Even when funded, the 20-minute window starts before the funding transaction lands.
- **How it was fixed:** not carried over. In `soln-combined`, `start()` pulls the supply with `safeTransferFrom`
  before starting the clock, and bids before `start()` revert.
- **Evidence:** `evidence/2026-10-28-probes/per-bid-contract.output.txt` (P3).

## AI-13: Seller proceeds depend on bidders claiming

- **Why the AI made the mistake:** `sellerProceeds` grows only inside `claim()`, by each claimer's cost, and
  `withdrawProceeds()` pays only that amount.
- **Why it is problematic:** a bidder who never claims holds back the seller's payment for their tokens, and that ETH
  stays in the contract permanently. In probe P2 the seller's withdrawal reverted with "No proceeds available" after
  the auction ended.
- **How it was fixed:** not carried over. In `soln-combined` the seller withdraws exactly `totalCommitted`, once,
  regardless of claims.
- **Evidence:** `evidence/2026-10-28-probes/per-bid-contract.output.txt` (P2).

## AI-14: Leftover template code and hard-coded addresses

- **Why the AI made the mistake:** the project was scaffolded from the Hardhat 3 and Vite templates, and the template
  files were not cleaned up. Contract addresses were pasted into each script and the frontend by hand after each
  deployment.
- **Why it is problematic:** `README.md` and `frontend/README.md` describe the templates, not the auction.
  `ignition/modules/Counter.ts` deploys a `Counter` contract that does not exist. The scripts point at one Sepolia
  deployment (`0x9240...2BB6`) and the frontend at another (`0x91F7...1F13`), so they operate on different auctions.
- **How it was fixed:** not carried over. `soln-combined` writes addresses to `deployments/<network>.json`, which
  the tasks and the frontend both read.
- **Evidence:** `evidence/2026-10-28-branch-comparison.md` (side-by-side table, "Deployment" and "Docs").

## AI-15: Misread commit ancestry

- **Why the AI made the mistake:** it read the order of a `git log --oneline --graph --all` listing, where `792b50d`
  appeared directly above `198e641`, as parentage. The listing sorts commits by date; it did not check `%P`.
- **Why it is problematic:** it told the operator that `dutch-auction-token-launch` was one commit on top of this
  branch. In fact it is a separate project with its own root commit, which changes how the branches can be merged.
- **How it was fixed:** git refused the merge as "unrelated histories". The AI checked the parents, corrected its
  statement to the operator and merged with `--allow-unrelated-histories`.
- **Evidence:** `../prompts/2026-10-28-session-03.md`.
- **Prevention:** check ancestry with `git log --format=%P` or `git merge-base`, not from the order of a listing.

## AI-16: Unverified attribution, again

- **Why the AI made the mistake:** it inferred from the repository name and the commit author that
  `dutch-auction-token-launch` was "the team's second implementation", and wrote that into the README and spec.
- **Why it is problematic:** it repeats AI-2: authorship in assessed work stated without confirmation.
- **How it was fixed:** the AI caught it on self-review and reworded both lines to describe the branch only, before
  committing. The team later confirmed the branch was AI-produced (see the provenance note above).
- **Evidence:** `../prompts/2026-10-28-session-03.md`.
- **Prevention:** as for AI-2.

## AI-17: Bid box cleared after the success message

- **Why the AI made the mistake:** `useTx.run` set the "confirmed" status, then awaited a refresh of every query,
  and only then returned `true`, which is when `BidCard` clears its input. The AI treated the success line and the
  form reset as one moment, but they were separated by a network round trip.
- **Why it is problematic:** anything typed into the bid box between "Bid confirmed" and the end of the refresh is
  wiped. The end-to-end test does exactly that (it types the 100 ETH sell-out bid as soon as "Bid confirmed"
  appears), so CI failed intermittently: runs #3 (a docs-only commit) and #6 timed out waiting for "This bid sells
  out the auction", while #4 and #5 passed on the same test. A user who types their next bid straight away hits the
  same thing.
- **How it was fixed:** `useTx.run` now refreshes the queries first and reports success afterwards, so the success
  line and the reset land in the same render. All cards that use `useTx` (bid, claim, settle, seller) get the fix.
- **Evidence:** CI run #6 log (`Timed out waiting for "This bid sells out the auction"`, `lifecycle.mjs:137`) and
  `frontend/src/hooks/useTx.ts`. The end-to-end test then passed 3 of 3 times locally; the local machine rarely hit the
  race before the fix either, so the confirming evidence is CI passing over the following runs.
