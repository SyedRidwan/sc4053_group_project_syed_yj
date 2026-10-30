import { ethToSellOut, impliedPrice, sellOutOffset } from "../lib/auction";
import { formatCountdown, formatEth, formatToken } from "../lib/format";
import { PhaseBadge, Term, type AuctionView } from "./ui";

const URGENT_SECONDS = 60n;

/** The big live numbers at the top of a listing. */
export function Overview({ listing, snapshot, now, price, phase }: AuctionView) {
  const { params, startTime, endTime, totalCommitted } = snapshot;
  const needed = ethToSellOut(params, price);
  const progress = needed === 0n ? 0 : Math.min(100, Number((totalCommitted * 10000n) / needed) / 100);
  const remaining = endTime - now;

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
      outlook = `Sells out in ${formatCountdown(startTime + offset - now)} at ${formatEth(impliedPrice(params, totalCommitted))} if no one else bids`;
    }
  }

  const live = phase === "active";

  return (
    <section className="overview" aria-label="Auction overview">
      <div className="overview-figures">
        <div className="figure figure-price">
          <span className="figure-label">
            {phase === "finalized" ? (
              <Term means="The single price every winning bidder pays, however early they bid.">Clearing price</Term>
            ) : (
              <>Price per {listing.symbol}</>
            )}
          </span>
          <span className="figure-value">{formatEth(phase === "finalized" ? snapshot.clearingPrice : price)}</span>
          <span className="figure-sub">
            {live ? "Falling from" : "Started at"} {formatEth(params.startPrice)}
            {live ? " to the " : ", with a "}
            <Term means="The lowest the price can go. If the auction reaches it, it settles there and unsold tokens are burned.">
              reserve
            </Term>{" "}
            of {formatEth(params.reservePrice)}
          </span>
        </div>
        <div className="figure">
          <span className="figure-label">Time left</span>
          <span className={`figure-value mono${live && remaining < URGENT_SECONDS ? " figure-urgent" : ""}`}>
            {live ? formatCountdown(remaining) : "0:00"}
          </span>
          <PhaseBadge phase={phase} />
        </div>
        <div className="figure">
          <span className="figure-label">
            <Term means="ETH that bidders have sent in so far. It buys the whole supply once the falling price meets it.">
              ETH committed
            </Term>
          </span>
          <span className="figure-value">{formatEth(totalCommitted)}</span>
          <span className="figure-sub">{outlook}</span>
        </div>
      </div>
      {live && (
        <div className="demand">
          <div className="demand-bar" role="progressbar" aria-label="Share of the ETH needed to sell out" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="demand-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="figure-sub">
            {progress.toFixed(1)}% of the {formatEth(needed)} that buys the whole supply right now
          </span>
        </div>
      )}
    </section>
  );
}
