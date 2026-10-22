# Dutch Auction: Test Issues Report

> Snapshot of the live Claude Doc (revision 50), exported 2026-10-22 during session 01. Sections were written as the session progressed, so earlier ones describe v1 before the rewrite. Live version (private unless shared): https://claude.ai/artifact/X1cnzZsVgVLAdrVokU7ece

Oct 22, 2026 · @Syed Ridwan

## Summary

All 4 tests fail on `npx hardhat test` (0 passing, 4 failing). The failures trace back to 3 contract bugs. Beyond them, the scratch experiments found 3 more critical bugs that the current tests cannot see, plus 1 economic design flaw in the spec itself.

**Update, same day:** Option A (the brief's committed-capital model) is now implemented and all 13 issues are fixed. The suite has 29 passing tests, `DutchAuction.sol` has 100% line and 97% branch coverage, and 9 deliberately re-injected bugs are all caught. Evidence is in `audit/evidence/` and the prompt log in `prompts/`.

- **Environment:** Node v24.11.0, Hardhat 2.29.1, Solidity 0.8.24, OpenZeppelin 5.x, commit `ef71e56` on `master`.
- **Scope:** `NTUToken.sol`, `DutchAuction.sol`, `ReentrancyAttacker.sol`, `test/DutchAuction.test.js`, `spec.md`. There is no frontend, README or deploy script yet. All of it was written by hand, before any AI tool was used.
- **Method:** ran the suite as committed. Then patched a scratch copy one fix at a time and re-ran, to confirm each root cause and look for bugs hidden behind earlier failures. The repo itself was not modified.

## Issues found in testing

Five of the 13 issues are critical: each one either steals ETH or tokens, or locks them in the contract for good. Issues 1–3 cause the 4 test failures. Issues 4–7 were hidden: the tests pass, or never reach them, while the contract misbehaves. Line numbers refer to `contracts/DutchAuction.sol` unless noted.

| # | Issue | Severity | Found by | Location | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Price truncation drift: `discountRate` rounds down | High | Tests 1, 2 (and blocks 3, 4) | 65, 79 | Fixed |
| 2 | "Burn" sends tokens to `address(0)`, which always reverts | Critical | Test 3, Slither | 135 | Fixed |
| 3 | Reentrancy in `claimTokensAndRefund` | Critical | Test 4, Slither | 141–164 | Fixed |
| 4 | Bidder who bridges the threshold is refunded twice | Critical | Hidden; scratch probe | 108–118 | Fixed |
| 5 | Seller withdrawal sweeps the refunds owed to bidders | Critical | Hidden; scratch probe | 166–172 | Fixed |
| 6 | Auction starts at deployment, before it holds any tokens | High | Hidden; scratch probe | 63–64 | Fixed |
| 7 | Tokens allocated at bid-time price, not by committed capital | Critical | Manual review | `spec.md`:12, 95 | Fixed |
| 8 | Return value of ERC20 `transfer` unchecked | Medium | Slither | 135 | Fixed |
| 9 | `bid()` writes state after its ETH refund call | Medium | Slither | 111–119 | Fixed |
| 10 | Sell-out path skips `finalizeAuction`, so no `AuctionFinalized` event | Low | Manual review | 102–107 | Fixed |
| 11 | Rounding dust is never allocated or burned | Low | Manual review | 95, 152 | Fixed |
| 12 | Push refunds: a contract that rejects ETH locks its own tokens | Low | Manual review | 157–160 | Fixed |
| 13 | Dead code: `discountRate`, `startTime` check, unused `Ownable` | Low | Manual review | 15, 85; `NTUToken.sol`:8 | Fixed |

### Why the critical and high issues matter

**1. Price drift.** (0.1 − 0.02) ETH ÷ 1200 s = 66,666,666,666,666.67 wei/s, but it is stored as …666. At 600 s the price is 0.0600000000000004 ETH, 400 wei too high, so every bid gets slightly fewer tokens. That dust breaks the sell-out check: in test 4, Alice's 36 ETH no longer covers the last 900 NTU, so the auction never clears. The rubric names "inaccurate price calculation" explicitly.

**2. Burn reverts.** OpenZeppelin ERC20 rejects transfers to `address(0)` (`ERC20InvalidReceiver`). So `finalizeAuction` reverts whenever any token is unsold. Claims call `finalizeAuction`, and seller withdrawal needs `isFinalized`, so every bidder's ETH and tokens and the seller's proceeds are locked for good. A transfer to `0xdead` would not reduce `totalSupply` either, so it would not be a real burn.

**3. Reentrancy.** `hasClaimed` is set only after the token transfer and the ETH call. With issue 1 patched, the test's attacker re-entered once and left with 8 ETH and 200 NTU instead of 4 ETH and 100 NTU. The extra came out of Alice's tokens and the seller's ETH. The brief's bonus asks you to show reentrancy resistance; the contract currently shows the opposite.

**4. Double refund.** `bid()` refunds the excess right away but records the full `msg.value` in `committedETH`, so `claimTokensAndRefund` refunds it again. In the probe, Bob paid 7 ETH net for 400 NTU instead of 16, and the seller was left with 31 ETH instead of 40. A bigger overbid steals more, up to the contract's whole balance. Test 2 still passes because it checks only token balances.

**5. Seller drain.** `withdrawSellerProceeds` sends `address(this).balance`, which includes refunds still owed, and it can be called repeatedly. In the probe the contract held 0 ETH afterwards and Alice's claim reverted with "ETH transfer failed". Her 600 NTU are stuck too, because the token transfer is in the same transaction. This is exactly the custodial trust problem the brief says a Dutch auction should remove.

**6. Unfunded start.** `startTime` is set in the constructor, but the tokens arrive in a separate transaction. In the probe, an auction holding 0 NTU accepted a 1 ETH bid. If the seller never funds it, claims fail. The 20-minute clock also starts at deployment, which makes a live frontend demo awkward.

**7. Wrong clearing rule (design).** `spec.md` locks each bid's tokens at its own bid price. The brief says the auction clears "when total committed capital meets total token supply". In test 2, Alice's 48 ETH covers all 1,000 NTU once the price reaches 0.048 ETH (t = 780 s). The contract instead waits until 0.04 ETH (t = 900 s). The seller gets 40 ETH instead of 48 (17% less), and Alice gets 600 NTU when her capital would buy 1,000 at the uniform price. The contract implements the spec faithfully, so the flaw is in the spec itself. That makes it strong material for the audit report's specification section.

Issues 8–13 are hygiene fixes, each covered in one line under Analysis and fixes.

### Gaps in the test suite

- **Fragile timing:** `time.increaseTo(startTime + 299n)` assumes the next block lands exactly 1 s later. It breaks if Hardhat's mining behaviour changes.
- **No ETH assertions:** the comments promise "24 ETH surplus refund" but never check it. That is why issue 4 passes unnoticed.
- **Low coverage:** with issues 1–3 patched, the 4 tests cover 84% of statements and 50% of branches in `DutchAuction.sol`. `withdrawSellerProceeds` and every revert path are untested.
- **Missing test types:** there are no revert, event, access-control, fuzz or invariant tests. One useful invariant: contract ETH ≥ refunds owed + seller proceeds.
- **Narrow attacker:** `ReentrancyAttacker` targets only `claimTokensAndRefund`, not the refund inside `bid()` or the seller path.
- **Static analysis is not enough:** Slither (102 detectors, 19 results) flagged issues 2, 3, 8 and 9 but missed 1, 4, 5, 6 and 7.
- **Tooling:** `package.json` has no `test` or `coverage` scripts.

## Analysis and fixes

Fix the clearing rule (issue 7) first. The recommended model removes issues 4 and 5 by design and halves the refund code you have to secure. Every fix below was checked in a scratch copy, not in your repo: issues 1–3 patched make all 4 original tests pass, and a prototype of the new model passes 3 of 3 new tests. Those 3 tests later proved too weak: the prototype had a rounding bug they missed (see audit/ai-issues.md). Each entry follows the brief's Major Issue Breakdown format (cause, fix, alternative, evidence), but v1 was written by hand, so these are review findings on your baseline rather than AI mistakes. The AI's own mistakes are logged separately in audit/ai-issues.md.

### Issue 7: Clearing rule (decide this first)

- **Root cause:** `spec.md` says bids "lock in tokens at the instantaneous price", and the contract implements that faithfully. The spec was never checked against the brief's clearing rule. The per-bid fixed-quantity model is common in generic auction tutorials and is easy to confuse with the uniform-price model.
- **Recommended (Option A), committed-capital model:** bidders commit ETH and nothing is priced per bid. The auction sells out when `totalCommitted ≥ supply × P(t)`. The bid that crosses is capped at the remaining room, and only its excess is refunded, in the same transaction. Every bidder claims `commitment ÷ clearingPrice` tokens, and the seller receives exactly `totalCommitted`.
- **Alternative (Option B):** keep fixed-quantity bids, fix issues 4 and 5, and justify the choice in the report. The diff is smaller, but it contradicts the brief's wording and leaves two refund paths to secure.
- **Evidence (prototype):** a 48 ETH bid at t = 300 s clears at 0.048 ETH at t = 780 s and receives all 1,000 NTU. Adding Bob's 25 ETH at t = 600 s accepts 12 ETH, refunds 13, and clears at 0.06 ETH: Alice 800 NTU, Bob 200 NTU, seller 60 ETH. An undersubscribed run settles at 0.02 ETH and burns supply down to 250 NTU.

The clearing price falls out of one formula, with S the token supply:

```latex
P_{\text{clear}} = \max\left(P_{\text{reserve}},\ \frac{\text{totalCommitted} \times 10^{18}}{S}\right)
```

The core of the prototype's `bid()`:

```solidity
uint256 room = (totalTokens * currentPrice()) / 1e18 - totalCommitted;
uint256 accepted = msg.value < room ? msg.value : room;
uint256 excess = msg.value - accepted;

commitments[msg.sender] += accepted;   // effects first
totalCommitted += accepted;
if (accepted == room) _finalize();     // this bid bridged the threshold

if (excess > 0) {                      // interaction last
    (bool ok, ) = payable(msg.sender).call{value: excess}("");
    require(ok, "Refund failed");
}
```

### Issue 1: Price drift

- **Root cause:** the code follows the common Solidity by Example `discountRate` pattern, which divides before it multiplies. Test 1 is titled "without integer truncation drift", yet the code breaks that property: the test describes the intended behaviour, not what the integer arithmetic actually does.
- **Fix:** multiply before dividing, and delete `discountRate`: `startPrice - ((startPrice - reservePrice) * elapsed) / DURATION`.
- **Alternatives:** step decay (the price drops every 30 s) is easier to show in the UI and to test. Exponential decay is more realistic but needs a fixed-point library such as PRBMath. If you choose `block.timestamp` over block numbers, say why in the report: it is the standard choice, and Sepolia blocks arrive about every 12 s.
- **Evidence:** with only this change, tests 1 and 2 pass.

### Issue 2: Burn reverts

- **Root cause:** a common misconception, "sending to `address(0)` burns". OpenZeppelin has always blocked transfers to the zero address.
- **Fix:** the auction burns its own unsold balance with `ERC20Burnable(address(token)).burn(unsold)`, which lowers `totalSupply`.
- **Alternatives:** make the auction the only minter and mint on claim, so unsold tokens never exist. That keeps supply clean, but the brief literally asks for a burn. Or have the seller call `burnFrom`, which adds a trust step. Burning is recommended.
- **Evidence:** test 3 passes, and `totalSupply` drops from 1,000 to 250 NTU.

### Issue 3: Reentrancy

- **Root cause:** checks-effects-interactions was not applied. The attacker test expects the contract to be safe, but nothing in the code makes it so.
- **Fix:** set `hasClaimed` before any external call, and add OpenZeppelin `nonReentrant` to `bid`, `claim` and `withdraw`.
- **Alternatives:** pull payments, where you credit `refunds[addr]` and add a separate `withdrawRefund()`. For the bonus, keep a test-only `VulnerableAuction.sol` and show the same attacker succeeding there and failing on the real contract. That gives the before-and-after evidence the brief asks for.
- **Evidence:** test 4 passes, and the attacker ends with 4 ETH and 100 NTU, the fair amounts.

### Issue 4: Double refund

- **Root cause:** two code paths compute refunds, and the second one does not account for the part of `msg.value` had already been returned. This is the "state across transactions" mistake the brief names.
- **Fix:** with Option A the issue disappears, because there is no claim-time refund. With Option B, record only the ETH actually used: `committedETH[msg.sender] += msg.value - excessEth`, and the same for `totalEthCommitted`.
- **Evidence:** the prototype test asserts Bob's net change is exactly −12 ETH with `changeEtherBalance`.

### Issue 5: Seller drain

- **Root cause:** the code uses the "sweep the whole balance" idiom and never separates the seller's money from the bidders'.
- **Fix:** pay exactly the proceeds, once, behind a flag. Under Option A that is `totalCommitted`; under Option B it is `totalTokensSold × clearingPrice ÷ 1e18`.
- **Alternative:** require every claim to finish before the seller can withdraw. Not recommended: one inactive bidder would block the seller forever.
- **Evidence:** in the prototype, the seller receives exactly 60 ETH and a second withdrawal reverts.

### Issue 6: Unfunded start

- **Root cause:** starting in the constructor is the simplest code, and it does not model deploy-then-fund as two separate transactions.
- **Fix:** add `start()`, callable once by the seller. It pulls exactly `totalTokens` with `safeTransferFrom` and only then sets `startTime` and `endTime`. Bids revert before that.
- **Alternative:** mint the sale supply straight to the auction in a deploy script. This works, but the start time is still fixed by deployment, which is bad for a live demo.
- **Evidence:** the prototype calls `start()` in `beforeEach`, and all 3 tests pass.

### Issues 8–13: Hygiene

| # | Fix |
| --- | --- |
| 8 | Use `SafeERC20` (`safeTransfer`, `safeTransferFrom`) for every token call. |
| 9 | In `bid()`, write all state before the refund call, and add `nonReentrant`. Slither's reentrancy-eth finding then clears. |
| 10 | Route every path through one internal `_finalize()` that always emits `AuctionFinalized`. The frontend will listen for it. |
| 11 | Burn based on tokens actually sold, and document that rounding always favours the contract. Optionally add a `sweepDust()` to burn leftovers after the claim window. |
| 12 | Option A removes claim-time ETH entirely. For the bid-time excess, keep the revert, or switch to a pull refund. |
| 13 | Delete `discountRate` and the always-true `startTime` check. Either use `Ownable` on `NTUToken` or remove it. |

### Fixing the test suite

- Replace `increaseTo(t - 1)` with `time.setNextBlockTimestamp(t)`, so each bid lands at an exact second.
- Assert money, not just tokens: `changeEtherBalances` and `changeTokenBalances` on every bid, claim and withdrawal.
- Add revert tests (`revertedWith`), event tests (`emit(...).withArgs`) and access-control tests for every `require`.
- Add invariant tests. Contract ETH must always be at least the refunds owed plus the seller's proceeds, and claimed tokens must never exceed supply. Foundry's invariant fuzzer is the strongest option and runs alongside Hardhat via `@nomicfoundation/hardhat-foundry`. If you want a single toolchain, use a seeded random-bid loop in Mocha instead.
- Set gates: `npx hardhat coverage` at 95% or more branches, and Slither with zero high or medium findings, with any false positives documented. Add `test`, `coverage` and `slither` scripts to `package.json`.

## Rubric alignment

Before this session, the project sat in the Fail–Pass band on all three rubric rows: the core contract lost funds, and there was no frontend, README or prompt log. The v2 rewrite fixes the contract and starts the prompt log. The frontend, README and deployment are still missing.

v1 was written by hand, before any AI tool was used, which makes it your human baseline. Its 13 issues are findings from an AI-assisted review (sections 1 and 6), not AI mistakes. Section 5's inventory of AI mistakes starts with the errors this session made in its own output, logged in `audit/ai-issues.md`. Keep v1 in git history, and tag `ef71e56` as `v1-baseline`.

| Rubric row | High Standard asks for | Now | What gets you there |
| --- | --- | --- | --- |
| Problem identification and solution design | Precise problem, technically accurate and complete Web3 solution | Spec encodes a clearing rule that contradicts the brief (issue 7) | Option A, plus a spec v2 that quotes the brief's clearing rule and answers its 4 "Tricky Points" explicitly |
| Development and AI audit quality | High-competence code; rigorous evaluation of AI tools, prompt specs and vulnerability fixes | 5 critical bugs, no prompt logs | All 13 issues fixed, each with before-and-after test evidence; prompt log kept from today |
| Codebase, docs and UX | Production-quality code, comprehensive docs, sleek UX, exemplary audit | No README, NatSpec, deploy script or frontend | NatSpec on every public function, README with setup and demo steps, a Sepolia deployment verified on Etherscan, and a frontend with live price, countdown, bid, claim and MetaMask |

What this session already gives each AI Audit Report section:

| Report section | Material you have now | Still to capture |
| --- | --- | --- |
| 1. Initial specification | Hand-written `spec.md` v1, contracts and tests (commits `138f1ce`, `5f6a2c4`, `ef71e56`), all written before any AI tool | The intended UI features |
| 2. Methodology and tooling | Claude Code, Hardhat, Slither, solidity-coverage | A `CLAUDE.md` or agent instruction file, and how the two of you split the work |
| 3. Specification engineering and prompt logs | `prompts/2026-10-22-session-01.md`, and `spec.md` v2, which the AI drafted from the brief | The v1 → v2 spec diff driven by issue 7, and prompts from later sessions |
| 4. AI-generated architecture | The AI's v2 design: committed-capital clearing, `start()`, pro-rata claims, a single `_finalize()` | A diagram of hand-written v1 against AI-proposed v2 |
| 5. Problems and vulnerability analysis | `audit/ai-issues.md`: 3 AI mistakes so far, in the brief's 4-part format | Your own line-by-line review of the AI's v2 code, plus issues from later sessions |
| 6. Validation and testing | AI-assisted review of v1: the 0/4 failing run, hidden-bug probes, Slither (19 results), 84% statement and 50% branch coverage. v2: 29 passing, 100% lines, 97% branches, 9 of 9 mutations caught | Slither triage signed off by the team, Sepolia transaction hashes |
| 7. Improvements | Pro-rata claims and the rounding test, added after mutation testing exposed the AI's prototype | Your own changes on top of the AI's v2, frontend features, and a gas comparison with `hardhat-gas-reporter` |
| 8. Lessons learned | The AI stated a guess about v1's authorship as fact. Its v2 prototype passed its own tests but had a rounding bug, caught only by mutation testing. Slither missed 5 of v1's 7 major issues | The team's own reflection |

## Next steps

The next session should start with the clearing-model decision, because it changes how the contract and the tests get rewritten.

- [x] Decide Option A or B for the clearing rule, and write `spec.md` v2 (A is recommended)
- [ ] Tag `ef71e56` as `v1-baseline` (the failing test log and Slither output are already saved in `audit/evidence/`)
- [ ] The dated prompt log in `prompts/` is started; still to add: a `CLAUDE.md` holding the spec and coding rules (CEI, SafeERC20, no balance sweeps)
- [x] Rewrite `DutchAuction.sol` with fixes 1–13, using the scratch prototype as the starting point
- [ ] Tests rebuilt (29 passing). Still to add: the same attacker run against a test-only vulnerable contract, for the reentrancy bonus demo
- [x] Add invariant or fuzz tests; reach at least 95% branch coverage and a clean Slither run; add npm scripts
- [ ] Write a deploy script, deploy to Sepolia and verify on Etherscan
- [ ] Build the frontend: live price curve, countdown, bid, claim, and refund and burn status
- [ ] Write the README and NatSpec, then draft the AI Audit Report from the tables above
