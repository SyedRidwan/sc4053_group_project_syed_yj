import { ethToSellOut, impliedPrice, sellOutOffset } from "../lib/auction";
import { formatCountdown, formatEth, formatToken } from "../lib/format";
import { PhaseBadge, type AuctionView } from "./ui";

export function Overview({ listing, snapshot, now, price, phase }: AuctionView) {
  const { params, startTime, endTime, totalCommitted } = snapshot;
  const needed = ethToSellOut(params, price);
  const progress = needed === 0n ? 0 : Math.min(100, Number((totalCommitted * 10000n) / needed) / 100);

  let countdown = "20:00";
  if (phase === "active") countdown = formatCountdown(endTime - now);
  else if (phase !== "not-started") countdown = "0:00";

  // Where the auction is heading if nobody else bids
  let outlook: string;
  if (phase === "finalized") {
    outlook = `Cleared at ${formatEth(snapshot.clearingPrice)}`;
  } else if (phase === "not-started") {
    outlook = `${formatToken(params.totalTokens, listing.symbol)} for sale`;
  } else {
    const offset = sellOutOffset(params, totalCommitted);
    if (phase === "sold-out") outlook = `Sold out at ${formatEth(impliedPrice(params, totalCommitted))}`;
    else if (offset === null) outlook = `Settles at the ${formatEth(params.reservePrice)} reserve unless more ETH arrives`;
    else {
      const remaining = startTime + offset - now;
      outlook = `Sells out in ${formatCountdown(remaining)} at ${formatEth(impliedPrice(params, totalCommitted))} if no one else bids`;
    }
  }

  return (
    <section className="overview" aria-label="Auction overview">
      <div className="stat">
        <span className="stat-label">Status</span>
        <PhaseBadge phase={phase} />
        <span className="stat-sub">{phase === "active" ? "Bids are open" : "20-minute window"}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Time left</span>
        <span className="stat-value mono">{countdown}</span>
        <span className="stat-sub">Chain time</span>
      </div>
      <div className="stat">
        <span className="stat-label">Price per {listing.symbol}</span>
        <span className="stat-value">{formatEth(phase === "finalized" ? snapshot.clearingPrice : price)}</span>
        <span className="stat-sub">
          {formatEth(params.startPrice)} → {formatEth(params.reservePrice)}
        </span>
      </div>
      <div className="stat stat-wide">
        <span className="stat-label">ETH committed</span>
        <span className="stat-value">{formatEth(totalCommitted)}</span>
        {phase !== "finalized" && phase !== "not-started" && (
          <>
            <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="stat-sub">
              {progress.toFixed(1)}% of the {formatEth(needed)} that buys the whole supply now
            </span>
          </>
        )}
        <span className="stat-sub stat-outlook">{outlook}</span>
      </div>
    </section>
  );
}
