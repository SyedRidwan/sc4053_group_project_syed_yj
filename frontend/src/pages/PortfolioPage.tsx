import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { dutchAuctionAbi, launchFactoryAbi } from "../abi";
import { BidForm } from "../components/BidForm";
import { Curve } from "../components/Curve";
import { PhaseBadge, TxStatusLine, VerifiedBadge, WalletAddLine, WatchButton } from "../components/ui";
import type { Deployment } from "../deployments";
import { useChainNow } from "../hooks/useAuction";
import { useClaim } from "../hooks/useClaim";
import { paramsOf, usePositions, type Listing, type Position } from "../hooks/useLaunches";
import { useTx } from "../hooks/useTx";
import { useWatchlist } from "../hooks/useWatchlist";
import { ethToSellOut, phaseOf, priceAt, type Phase } from "../lib/auction";
import { formatCountdown, formatEth, formatToken, formatUnits18 } from "../lib/format";
import { launchHref } from "../lib/route";
import { project } from "../lib/simulate";
import type { ChainId } from "../wagmi";

const URGENT_SECONDS = 60n;

/** One coin the wallet is involved in, with everything needed to act on it right here. */
function Tracker({ listing, position, phase, now, account }: { listing: Listing; position?: Position; phase: Phase; now: bigint; account: Address }) {
  const chainId = listing.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const { tx: claimTx, walletAdd, claim, addToWallet } = useClaim(listing);
  const sellerTx = useTx(chainId);
  const [bidding, setBidding] = useState(false);

  const params = paramsOf(listing);
  const price = priceAt(params, listing.startTime, now);
  const live = phase === "active";
  const remaining = listing.endTime - now;
  const needed = ethToSellOut(params, price);
  const progress = needed === 0n ? 0 : Math.min(100, Number((listing.totalCommitted * 10000n) / needed) / 100);

  const commitment = position?.commitment ?? 0n;
  const balance = position?.tokenBalance ?? 0n;
  const claimed = position?.claimed ?? false;
  const isSeller = listing.seller.toLowerCase() === account.toLowerCase();
  const share = listing.totalCommitted === 0n ? 0 : Number((commitment * 10000n) / listing.totalCommitted) / 100;
  const outcome = project(params, commitment, listing.totalCommitted);

  const canClaim = !live && commitment > 0n && !claimed;
  const needsSettling = phase === "sold-out" || phase === "ended";
  const canWithdraw = isSeller && listing.finalized && !listing.proceedsWithdrawn;

  function settle() {
    return sellerTx.run("Settle", () =>
      writeContractAsync({ address: listing.auction, abi: dutchAuctionAbi, functionName: "finalize", chainId })
    );
  }

  function withdraw() {
    return sellerTx.run("Withdraw", () =>
      writeContractAsync({ address: listing.factory, abi: launchFactoryAbi, functionName: "withdrawProceeds", args: [listing.id], chainId })
    );
  }

  return (
    <li className={live ? "tracker tracker-live" : "tracker"}>
      <div className="tracker-coin">
        <a className="tracker-ticker" href={launchHref(listing.id)}>
          {listing.symbol}
        </a>
        <span className="coin-name">
          {listing.name}
          {listing.verified && <VerifiedBadge />}
        </span>
        <span className="tracker-roles">
          {isSeller && <span className="tag tag-role">You're the seller</span>}
          {commitment > 0n && <span className="tag tag-role">You bid</span>}
          <WatchButton id={listing.id} symbol={listing.symbol} />
        </span>
      </div>

      <div className="tracker-live-data">
        <div className="tracker-numbers">
          <div className="figure">
            <span className="figure-label">{listing.finalized ? "Final price" : "Price now"}</span>
            <span className="tracker-price">{formatUnits18(listing.finalized ? listing.clearingPrice : price, 5)} ETH</span>
          </div>
          <div className="figure">
            <span className="figure-label">{live ? "Time left" : "Status"}</span>
            {live ? (
              <span className={`tracker-price mono${remaining < URGENT_SECONDS ? " figure-urgent" : ""}`}>{formatCountdown(remaining)}</span>
            ) : (
              <PhaseBadge phase={phase} />
            )}
          </div>
        </div>
        <Curve params={params} elapsed={now - listing.startTime} totalCommitted={listing.totalCommitted} live={live} />
        {live && (
          <div className="demand">
            <div className="demand-bar" role="progressbar" aria-label={`Share of the ETH needed to sell out ${listing.symbol}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="demand-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="figure-sub">
              {formatEth(listing.totalCommitted, 4)} of {formatEth(needed, 4)} to sell out
            </span>
          </div>
        )}
      </div>

      <div className="tracker-stake">
        {commitment > 0n ? (
          <dl className="stake">
            <div>
              <dt>You committed</dt>
              <dd>{formatEth(commitment)}</dd>
            </div>
            {live && (
              <>
                <div>
                  <dt>Your share of bids</dt>
                  <dd>{share.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>If no one else bids</dt>
                  <dd>
                    {formatToken(outcome.tokens, listing.symbol)} at {formatEth(outcome.clearingPrice, 4)}
                  </dd>
                </div>
              </>
            )}
            {!live && (
              <div>
                <dt>Tokens</dt>
                <dd>{claimed ? "Claimed" : formatToken(listing.finalized ? (position?.tokensOwed ?? 0n) : outcome.tokens, listing.symbol)}</dd>
              </div>
            )}
          </dl>
        ) : isSeller ? (
          <dl className="stake">
            <div>
              <dt>ETH raised</dt>
              <dd>{formatEth(listing.totalCommitted)}</dd>
            </div>
            <div>
              <dt>Proceeds</dt>
              <dd>{listing.proceedsWithdrawn ? "Withdrawn" : canWithdraw ? "Ready" : "After settlement"}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">You're tracking this coin, with no bid in it yet.</p>
        )}
        {balance > 0n && (
          <p className="tracker-balance">
            In your wallet: <strong>{formatToken(balance, listing.symbol)}</strong>
          </p>
        )}

        <div className="tracker-actions">
          {canClaim && (
            <button className="button button-primary" type="button" disabled={claimTx.busy} onClick={() => claim(listing.finalized ? "Claim" : "Settle and claim")}>
              {claimTx.busy ? "Claiming…" : listing.finalized ? "Claim tokens" : "Settle and claim tokens"}
            </button>
          )}
          {needsSettling && !canClaim && (
            <button className="button button-primary" type="button" disabled={sellerTx.busy} onClick={settle}>
              {sellerTx.busy ? "Settling…" : "Settle auction"}
            </button>
          )}
          {canWithdraw && (
            <button className="button button-primary" type="button" disabled={sellerTx.busy} onClick={withdraw}>
              {sellerTx.busy ? "Withdrawing…" : `Withdraw ${formatEth(listing.totalCommitted)}`}
            </button>
          )}
          {live && (
            <button className="button" type="button" aria-expanded={bidding} onClick={() => setBidding(!bidding)}>
              {bidding ? "Close" : commitment > 0n ? "Bid more" : "Bid"}
            </button>
          )}
          <a className="button button-quiet" href={launchHref(listing.id)}>
            Details
          </a>
        </div>
        <TxStatusLine status={claimTx.status} />
        <WalletAddLine state={walletAdd} symbol={listing.symbol} onRetry={addToWallet} />
        <TxStatusLine status={sellerTx.status} />
        {bidding && live && (
          <div className="tracker-bid">
            <BidForm
              id={`bid-amount-${listing.id}`}
              listing={listing}
              price={price}
              totalCommitted={listing.totalCommitted}
              commitment={commitment}
              account={account}
            />
          </div>
        )}
      </div>
    </li>
  );
}

// Things waiting on the wallet come first, then live coins ending soonest, then the rest
function urgency(listing: Listing, position: Position | undefined, phase: Phase, account: Address): number {
  const isSeller = listing.seller.toLowerCase() === account.toLowerCase();
  const owed = (position?.commitment ?? 0n) > 0n && !position?.claimed && phase !== "active";
  if (owed || (isSeller && !listing.proceedsWithdrawn && phase !== "active")) return 0;
  return phase === "active" ? 1 : 2;
}

export function PortfolioPage({
  deployment,
  listings,
  chainTime,
  fetchedAt,
  account,
}: {
  deployment: Deployment;
  listings: Listing[];
  chainTime: bigint;
  fetchedAt: number;
  account?: Address;
}) {
  const { openConnectModal } = useConnectModal();
  const positions = usePositions(deployment, account);
  const { isWatched } = useWatchlist();
  const now = useChainNow({ chainTime, fetchedAt }) ?? chainTime;

  if (!account) {
    return (
      <div className="page">
        <section className="notice">
          <h2>Connect a wallet to see your portfolio</h2>
          <p className="muted">Your wallet is your account here. There is nothing to sign up for.</p>
          <button className="button button-primary" type="button" onClick={() => openConnectModal?.()}>
            Connect wallet
          </button>
        </section>
      </div>
    );
  }

  const rows = listings
    .map((listing) => ({ listing, position: positions.data?.get(listing.id), phase: phaseOf(paramsOf(listing), listing, now) }))
    .filter(
      ({ listing, position }) =>
        (position?.commitment ?? 0n) > 0n ||
        (position?.tokenBalance ?? 0n) > 0n ||
        listing.seller.toLowerCase() === account.toLowerCase() ||
        isWatched(listing.id)
    )
    .sort((a, b) => {
      const order = urgency(a.listing, a.position, a.phase, account) - urgency(b.listing, b.position, b.phase, account);
      return order !== 0 ? order : Number(a.listing.endTime - b.listing.endTime);
    });

  const committed = rows.reduce((sum, { position }) => sum + (position?.commitment ?? 0n), 0n);
  const liveCount = rows.filter(({ phase }) => phase === "active").length;
  const toClaim = rows.filter(({ position, phase }) => (position?.commitment ?? 0n) > 0n && !position?.claimed && phase !== "active").length;
  const held = rows.filter(({ position }) => (position?.tokenBalance ?? 0n) > 0n).length;

  return (
    <div className="page">
      <header className="section-head">
        <h2>Your coins</h2>
        <p className="muted">Everything you've bid on, launched or starred, live. You can bid, claim and withdraw from here.</p>
      </header>

      <dl className="pulse" aria-label="Portfolio summary">
        <div>
          <dt>Tracking live</dt>
          <dd>{liveCount}</dd>
        </div>
        <div>
          <dt>ETH committed</dt>
          <dd>{formatUnits18(committed, 5)}</dd>
        </div>
        <div>
          <dt>Ready to claim</dt>
          <dd className={toClaim > 0 ? "pulse-attention" : undefined}>{toClaim}</dd>
        </div>
        <div>
          <dt>Coins held</dt>
          <dd>{held}</dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <section className="notice">
          <h2>Nothing to track yet</h2>
          <p className="muted">
            Bid on a coin, launch your own, or star one on the <a href="#/">market</a>, and it will appear here with live prices.
          </p>
        </section>
      ) : (
        <ul className="trackers">
          {rows.map(({ listing, position, phase }) => (
            <Tracker key={listing.id.toString()} listing={listing} position={position} phase={phase} now={now} account={account} />
          ))}
        </ul>
      )}
    </div>
  );
}
