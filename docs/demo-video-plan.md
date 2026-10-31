# Demo video storyboard (10 minutes maximum)

The submission requires a quick introduction to the architecture first, then a detailed hands-on demo of the deployed
solution. This plan runs to about 9:20, which leaves 40 seconds spare. The timings are estimates until the first rehearsal
with real MetaMask.

**The thread to carry through:** *everyone pays the same price, however early they bid, and every claim on screen can be checked.*

| Part | Time | Format | Purpose |
| --- | --- | --- | --- |
| 1. Why and how | 0:00 to 1:50 | Slides and the site's simulator | Problem and architecture, as the submission requires |
| 2. Hands-on demo | 1:50 to 7:30 | One take of the live site with MetaMask | Every requirement in the brief, working |
| 3. Why you can trust it | 7:30 to 9:20 | Terminal clip and slides | Reentrancy bonus, test evidence and the AI audit |

Record the three parts separately and join them. A mistake in one then never costs you the others.

## Part 1: Why and how (1:50)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | **Slide: title.** Project name, team names, "SC4053 Option 2". | Horton's Launchpad: anyone can launch a token, and every token sells in a fair 20-minute Dutch auction. |
| 0:10 | **Slide: the problem.** Gas wars, guessed prices, bots. | Fixed-price sales reward whoever pays the most gas and gets there first, and the price is a guess. |
| 0:30 | **Screen: How it works page.** Leave the sliders at 30, 15 and 15, then press Play. | The price falls until the ETH committed can buy every token. Here that's 60 ETH for 1,000 tokens, so it stops at 0.06. Everyone pays 0.06, including whoever bid first. Your bid is a share of a pool, not a purchase at that moment's price. |
| 1:05 | **Slide: architecture.** Wallet → `LaunchFactory` → one `HortonsToken` and one `DutchAuction` per listing. React site reading the chain, with no backend. | One factory call creates a token and its auction. Bidders then deal with that auction directly. The auction holds the money, the curator can't reach it, and there is no server to trust. The wallet is the only login. |

## Part 2: Hands-on demo (5:40, one take)

| Take | Video | Wallet | Do | Say |
| --- | --- | --- | --- | --- |
| 0:00 | 1:50 | None | Market page. Scroll to the list, and toggle the theme once. | Six listings in different states, on a local chain. No wallet is needed to browse. |
| 0:20 | 2:10 | #3 buyer | Open **Horton's**. Open Under the hood. Bid 5 ETH and confirm in MetaMask. | The price comes from the block's timestamp, and these are the contract's real sums. My bid joins the pool, and the dashed line shows where it would now sell out. |
| 1:00 | 2:50 | #3 buyer | Open **Meridian**. Type 100 ETH, and point at the preview. Confirm. Then point at the **Activity** feed. | **This is the key moment.** I've bid far more than it needs. Only the remaining room is accepted, and the surplus comes back in the same transaction. Now look at the feed: these bidders committed at 0.05 and 0.04, and they all pay this one clearing price. |
| 2:00 | 3:50 | #3 buyer | Claim, and approve MetaMask's request to add MRD. Show the balance. | Claiming transfers my share, and the site asks the wallet to show the token. A wallet always wants its owner's approval for that. |
| 2:25 | 4:15 | #1 seller | **Launch a token.** Enter a start price below twice the reserve to show the error. Fix it and launch. | Sellers choose the supply and the prices, within limits, and never the 20 minutes or the curve. One transaction creates the token and the auction, and the clock is running. |
| 3:15 | 5:05 | #1 seller | Open **Aurora** and withdraw. | Only this listing's seller sees this button, and it pays exactly the ETH committed, once. |
| 3:40 | 5:30 | #3 buyer | **Portfolio.** Show the ticking tracker. Star a coin. | Every coin I've bid on, launched or starred, live, with my projected outcome. |
| 4:05 | 5:55 | #0 curator | Open **Free Money** and hide it. Show the market without it. Verify the token launched earlier. | The curator can label and hide listings, and nothing more. A hidden auction keeps running, so hiding can never trap anyone's funds. |
| 4:40 | 6:30 | #3 buyer | Open **Nova**, and let the countdown reach 0:00. Settle it. Point at Tokens burned and total supply. | The other way an auction ends: 20 minutes pass without a sell-out. It settles at the reserve, and 3,750 unsold tokens are burned. Total supply really falls, from 5,000 to 1,250. |
| 5:30 | 7:20 | Any | Back to the Market. | Sold out or expired, every listing follows the same rules. |

## Part 3: Why you can trust it (1:50)

| Time | Show | Say |
| --- | --- | --- |
| 7:30 | **Terminal:** `npx hardhat test --grep "[Rr]e-?entr"`, already run and scrolled to the result. | The brief's bonus is reentrancy. These attacker contracts try to re-enter during the refund, and during a seller's withdrawal. |
| 7:55 | **Slide: reentrancy.** Our hand-written v1: attacker ends with 8 ETH + 200 NTU, against a fair 4 ETH + 100 NTU. Today: one attempt, no successes. | Our first hand-written version really was drainable, so we know this attack works. Now state is written before any ETH moves, and every function that moves money is locked. |
| 8:15 | **Slide: evidence.** 87 contract tests, 39 frontend tests, 17 end-to-end steps, 100% line coverage, 98% branch coverage, 23 of 23 deliberate bugs caught, Slither with no high-severity results, all in CI. | Coverage only shows the code ran. So we planted 23 bugs on purpose to check that the tests catch them. Three got through at first, so we wrote new tests. |
| 8:35 | **Slide: the AI audit.** 28 logged AI mistakes. Three examples: (1) AI-10, a design that paid the seller 166.67 ETH instead of 600. (2) AI-1, stuck tokens that got past 28 passing tests. (3) AI-28, a bid that ran out of gas, hidden by the test wallet. | We built with AI tools, including Claude Code, and audited them like an untrusted contributor. Passing tests weren't enough: this one got past 28 of them. Every mistake is logged with its cause, its fix and the evidence, in the AI Audit Report. **[TEAM] Add your own one-line lesson here.** |
| 9:10 | **Slide: close.** Brief requirements with ticks, and the repository name. | Thank you. |

## Before recording

1. Stop anything on ports 8545 and 5173, then run `npm run demo -- --expires-in 420`. Nova's 7-minute countdown starts when
   seeding finishes.
2. In MetaMask, on the local network, run "Clear activity and nonce data" for accounts #0, #1 and #3.
3. Connect each account to the site once, so no connection prompts appear on camera.
4. Start Part 2 about **2 minutes after seeding finishes**, so Nova reaches 0:00 about 5 minutes into the take. Check the time left
   on Nova's page before you start.
5. Record at 1080p with the whole screen in view, not one browser window. MetaMask opens its own window, which a window
   recording would miss.
6. Run `npx hardhat test --grep "[Rr]e-?entr"` ahead of time for Part 3, and enlarge the terminal font.
7. Rehearse the whole of Part 2 once. A retake needs a fresh `npm run demo` and step 2 again.

## If something goes wrong

- **Nova is not at 0:00 yet:** keep talking over the Under the hood sums. Avoid an unexplained cut in the countdown, which would
  undercut "exactly 20 minutes". If you do trim a wait, say so.
- **Nova has already ended:** show its Settle card, then settle it. The burn still happens on camera.
- **MetaMask shows "Transaction failed" but the site says confirmed:** the site reads the chain. This is the nonce issue in the
  README, so stop and redo step 2.

## Avoid

- Calling it an "exchange". It is a launchpad; an exchange is Option 1 in the brief.
- Reading the slides aloud, or showing code at length. The report and the repository are there for that.
