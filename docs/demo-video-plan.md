# Demo video plan (10 minutes maximum)

The submission requires a quick introduction to the architecture first, then a detailed hands-on demo of the deployed
solution. The timings below leave about 30 seconds spare.

## Before recording

1. Stop anything on ports 8545 and 5173, then run `npm run demo -- --expires-in 600`. Nova's 10-minute countdown starts
   when seeding finishes, not when you start recording.
2. In MetaMask, on the local network, run "Clear activity and nonce data" for accounts #0, #1 and #3.
3. Connect each account to the site once, so no connection prompts appear on camera.
4. Start recording about 2 minutes after seeding finishes, so Nova expires near 8:00 in the video. Nova's page shows the time
   left, so check it before you start.
5. Rehearse the whole run first. A retake needs a fresh `npm run demo` and step 2 again.

## Run sheet

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Architecture diagram or slide | The problem the brief describes (gas wars, poor price discovery), and how a uniform-price Dutch auction answers it. |
| 0:40 | `LaunchFactory`, `DutchAuction`, `HortonsToken` in the editor | One factory, one token and one auction per launch. The audited auction is unchanged; a test compares the deployed code. |
| 1:15 | Terminal: test, coverage, mutation and reentrancy results | 81 tests, coverage, and that test attackers fail. Point to the AI Audit Report. |
| 1:45 | Market page, no wallet | Six listings in different states, in light and dark. Browsing needs no account: the wallet is the identity. Show the How it works simulator in one play-through. |
| 2:15 | Horton's listing as #3 (buyer) | The falling price and chart. Bid 5 ETH, confirm in MetaMask, and point out the activity feed. |
| 3:15 | Meridian as #3 | Bid far more than is needed. The preview shows the refund. After it sells out, show the refund and that everyone pays one price. |
| 4:15 | Claim on Meridian | Claim, approve MetaMask's request to add MRD, and show the balance there. The site asks for you; a wallet always wants its owner's approval. |
| 4:45 | Launch a token as #1 (seller) | First try a start below twice the reserve to show the check. Then launch a real token in one transaction and land on its page. |
| 5:45 | Aurora as #1 | Withdraw the proceeds. Show that this button is only for this listing's seller. |
| 6:15 | Portfolio as #3, then #1 | The live tracker: prices and countdowns ticking, your projected outcome, and a bid placed without leaving the page. Star a coin to add it. |
| 6:45 | Free Money as #0 (curator) | Hide it, then show it leaving the market. State that the curator cannot touch funds or auctions. Verify the listing launched at 4:45. |
| 7:30 | Cobalt | A settled auction: tokens sold, tokens burned, and the lower total supply. |
| 8:00 | Nova, as its countdown ends | Watch it reach 0:00, then settle it: tokens burned live, total supply falls, and the price stays at the reserve. |
| 9:00 | Back to the Market | Sum up: each clause of the brief, across every listing. |

## Avoid

- Calling it an "exchange". It is a launchpad; an exchange is Option 1 in the brief.
- Any unexplained jump cut in the countdown, which would undercut "exactly 20 minutes". Say so if you trim a wait.
