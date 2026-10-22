# System Specification: Dutch Auction Token Launch (SC4053 Option 2)

## 1. System Scope & Objectives
Implement an Ethereum token launch dApp using a Uniform Clearing Price Dutch Auction over a fixed 20-minute window.
- **Project Token (`NTUToken.sol`):** ERC20 token with 18 decimals and supply burn support.
- **Auction Engine (`DutchAuction.sol`):** Standalone contract managing linear price decay, ETH bid commitments, threshold-bridging partial fills, uniform clearing settlement, and unsold token disposal.

## 2. Core Mechanics
1. **Price Decay:** Price opens at `startPrice` ($P_{\text{start}}$) and decays linearly over $T = 1200\text{s}$ (20 minutes) to `reservePrice` ($P_{\text{reserve}}$).
2. **Token Allocation & Threshold Bridging:**
   - Bidders commit ETH via `bid()` to lock in tokens at the instantaneous price $P(t)$.
   - If a bid's requested token amount exceeds the remaining supply ($S - Q_{\text{sold}}$), the bidder receives the exact remaining supply, the auction immediately finalizes, and `clearingPrice` locks at $P(t)$.
3. **Uniform Clearing Settlement:**
   - All winning bidders pay the final `clearingPrice` ($P_{\text{clear}}$).
   - Surplus ETH ($\text{committedETH} - \text{allocatedTokens} \times P_{\text{clear}} / 10^{18}$) is refunded upon claim.
4. **Unsold Supply Burn:**
   - If the 20-minute window expires with unsold tokens, `clearingPrice` settles at `reservePrice` and all unsold tokens are permanently removed from supply.