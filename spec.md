# System Specification v3: Horton's Launchpad, Dutch Auction Token Launches (SC4053 Option 2)

> v1 (commit `138f1ce`) was written by hand before any AI tool was used; v2 was drafted with Claude Code
> (session 01, see `prompts/`) from the brief and v1. v1 allocated tokens at each bid's own price. That contradicts the brief's clearing rule
> ("when total committed capital meets total token supply, the auction clears") and underpaid the seller by 17%
> in our own test scenario. v2 follows the brief's wording clause by clause. See `audit/evidence/` for the v1 failures.
> The second implementation in this repository (`dutch-auction-token-launch`) used the same per-bid rule; on the same bids it
> settled at the reserve where v2 sells out at three times that price (`audit/evidence/2026-10-28-branch-comparison.md`).

> v3 (session 04) adds `LaunchFactory.sol`, so that anyone can launch a token through the same auction. Sections 1 to 5
> below describe one launch and still apply unchanged to every listing. Section 6 describes the launchpad.
## 1. System Scope
Ethereum token launch where tokens are bid for with Ether and distributed by a uniform clearing price Dutch auction
over a 20-minute window.

- **Project token (`HortonsToken.sol`):** fixed-supply ERC20 (18 decimals) with `ERC20Burnable`, so burns reduce `totalSupply`.
- **Auction engine (`DutchAuction.sol`):** separate contract holding the sale supply, ETH commitments, clearing,
  burning, claims and seller proceeds.

## 2. Brief Requirements → Rules

| Brief clause | Rule in this system |
| --- | --- |
| Descending price, predefined decay function | `P(t) = P_start − (P_start − P_reserve) × t / 1200`, computed multiply-before-divide on every call. `t` comes from `block.timestamp`. |
| Participants commit ETH capital | `bid()` records ETH only. No price or token quantity is fixed per bid. |
| Clears when committed capital meets total supply | Sold out when `totalCommitted ≥ S × P(t) / 1e18`. Bids revert once sold out. |
| Bid that bridges the threshold (tricky point) | The bid is accepted up to `room = S × P(t) / 1e18 − totalCommitted`. The auction finalizes in the same transaction. |
| Every winning bidder pays the same clearing price | `P_clear = max(P_reserve, totalCommitted × 1e18 / S)`. Each bidder receives `commitment × tokensSold / totalCommitted`. |
| Excess ETH is refunded automatically | The bridging bid's surplus `msg.value − room` is refunded inside `bid()`. It is the only refund path. |
| Runs for exactly 20 minutes | `endTime = startTime + 1200`. The window ends early only by selling out, which is the brief's clearing condition. |
| Sell out at/above reserve, or unsold tokens are burned | If time expires first, `P_clear = P_reserve`, `tokensSold = totalCommitted / P_reserve`, and the rest is burned with `ERC20Burnable.burn`. |
| Distribute minted tokens | Bidders `claim()` tokens after finalization (pull pattern, no loops over bidders). |
| Reentrancy resistance (bonus) | Checks-effects-interactions on every external call, plus OpenZeppelin `nonReentrant` on `bid`, `claim`, `withdrawProceeds`. |

## 3. Lifecycle
1. **Deploy:** token mints the supply to the seller; seller deploys the auction with `(token, supply, startPrice, reservePrice)`.
2. **Start:** seller approves the auction, then calls `start()`. It pulls exactly `S` tokens and starts the 20-minute clock.
   Bids before this revert.
3. **Bid:** anyone calls `bid()` with ETH while the auction is active.
4. **Finalize:** automatic on the bridging bid; otherwise anyone calls `finalize()` once sold out or after `endTime`.
   `claim()` also finalizes if needed.
5. **Claim:** each bidder claims their tokens once.
6. **Withdraw:** seller withdraws exactly `totalCommitted`, once. This never touches tokens owed to bidders.

## 4. Invariants (enforced by tests)
- The ETH the contract tracks equals `totalCommitted` until the seller withdraws, and the contract pays out only that
  tracked amount. Its raw balance can be higher: anyone can force ETH in with `selfdestruct`. That ETH is never paid to
  anyone and stays stuck, so it cannot affect a bidder or the seller.
- `tokensSold + tokensBurned = S`, and `token.totalSupply()` drops by `tokensBurned`.
- Sum of claimed tokens ≤ `tokensSold`. Rounding dust is below 1 token-wei per bidder and always favours the contract.
- Every bidder's effective price equals `P_clear` up to rounding dust. The exception is a dust bid too small to buy
  1 token-wei: a 1 wei bid at a clearing price above 1 ETH per token is owed 0 tokens, `claim()` reverts with "Nothing
  to claim", and that wei goes to the seller. The web app blocks bids this small.
- `P_clear ≥ P_reserve`.

## 5. Coding Rules for AI Tools
- Multiply before divide in all fixed-point maths; units are wei per whole token (1e18 token-wei).
- Checks-effects-interactions; no external call before state is final; `nonReentrant` on ETH- or token-moving functions.
- `SafeERC20` for all token transfers; burn with `ERC20Burnable.burn`, never by transfer to `address(0)`.
- Never send `address(this).balance`; pay only computed, tracked amounts.
- Tests assert ETH and token balances, events, reverts and invariants, not only token balances.
- A function whose gas cost depends on when it is mined must not rely on a wallet's estimate. `bid()` costs about 67k gas
  as a plain bid and about 153k as a sell-out, and the price can cross that line while a wallet waits, so the web app sends
  a fixed limit of 200k.

## 6. Launchpad (v3)

`LaunchFactory.sol` lets anyone create a token and its auction in one transaction. `DutchAuction.sol` and
`HortonsToken.sol` are unchanged, and a test compares the factory's deployed code with a direct deployment.

| Rule | How it is enforced |
| --- | --- |
| One launch = one token + one auction | `createLaunch` deploys both, moves the whole supply into the auction and starts it. Auctions share no state. |
| Exactly 20 minutes and a linear curve, always | `DURATION` is a constant, and `createLaunch` takes only name, symbol, supply, start price and reserve price. |
| Factory-made tokens only | There is no token input. In the prototype, 5 of 5 unusual external tokens misbehaved, and a non-burnable one locked ETH permanently. |
| The price really descends | `startPrice ≥ 2 × reservePrice` and `reservePrice ≥ 1 gwei`. |
| No instant dust sell-outs | `supply × reservePrice / 1e18 ≥ 0.001 ETH`. |
| Values stay in range | `1 ≤ whole tokens ≤ 1e15`, `startPrice ≤ 1000 ETH`, name ≤ 32 bytes, symbol ≤ 11 bytes. |
| Seller is paid correctly | The factory is the on-chain seller, so `withdrawProceeds(id)` checks the registered seller and forwards exactly `totalCommitted`, under `nonReentrant`. |
| Curator's power is limited | The curator can only set `hidden` and `verified`, which no auction reads. A test traces these calls and finds no external call. There is no pause and no upgrade path. |

**Roles.** There are no accounts and no logins: the wallet is the identity. A seller is whoever created a listing, a
bidder is whoever has committed to one, and the curator is one fixed address. One wallet can be seller and bidder.

**Hidden listings.** Hiding removes a listing from the market page only. Its auction keeps running and its page still
works, so hiding can never trap a bidder's funds.

**Early end.** A listing can end before 20 minutes only by selling out, which is the brief's clearing rule. The minimum
raise stops this from happening on a trivially small bid.

**Known limits.** Anyone can create a listing, so names can mislead; the site shows each address and the curator's
verified badge. A seller can bid on their own listing, which no on-chain rule can prevent. Each listing's token contract
is named `HortonsToken` whatever the coin is called, because reusing the contract unchanged keeps its test evidence valid.
