# System Specification v2: Dutch Auction Token Launch (SC4053 Option 2)

> v1 (commit `138f1ce`) was written by hand before any AI tool was used; v2 was drafted with Claude Code
> (session 01, see `prompts/`) from the brief and v1. v1 allocated tokens at each bid's own price. That contradicts the brief's clearing rule
> ("when total committed capital meets total token supply, the auction clears") and underpaid the seller by 17%
> in our own test scenario. v2 follows the brief's wording clause by clause. See `audit/evidence/` for the v1 failures.
> The second implementation in this repository (`dutch-auction-token-launch`) used the same per-bid rule; on the same bids it
> settled at the reserve where v2 sells out at three times that price (`audit/evidence/2026-10-28-branch-comparison.md`).

## 1. System Scope
Ethereum token launch where tokens are bid for with Ether and distributed by a uniform clearing price Dutch auction
over a 20-minute window.

- **Project token (`NTUToken.sol`):** fixed-supply ERC20 (18 decimals) with `ERC20Burnable`, so burns reduce `totalSupply`.
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
- Contract ETH balance equals `totalCommitted` until the seller withdraws, then 0.
- `tokensSold + tokensBurned = S`, and `token.totalSupply()` drops by `tokensBurned`.
- Sum of claimed tokens ≤ `tokensSold`. Rounding dust is below 1 token-wei per bidder and always favours the contract.
- Every bidder's effective price equals `P_clear` up to rounding dust.
- `P_clear ≥ P_reserve`.

## 5. Coding Rules for AI Tools
- Multiply before divide in all fixed-point maths; units are wei per whole token (1e18 token-wei).
- Checks-effects-interactions; no external call before state is final; `nonReentrant` on ETH- or token-moving functions.
- `SafeERC20` for all token transfers; burn with `ERC20Burnable.burn`, never by transfer to `address(0)`.
- Never send `address(this).balance`; pay only computed, tracked amounts.
- Tests assert ETH and token balances, events, reverts and invariants, not only token balances.
