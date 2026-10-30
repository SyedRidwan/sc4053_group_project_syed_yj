import { useState } from "react";
import { PhaseBadge, HiddenBadge, VerifiedBadge } from "../components/ui";
import { useChainNow } from "../hooks/useAuction";
import { paramsOf, type Listing } from "../hooks/useLaunches";
import { ethToSellOut, phaseOf, priceAt, tokensSoldAt, type Phase } from "../lib/auction";
import { formatCountdown, formatEth, formatToken, shortAddress } from "../lib/format";
import { launchHref } from "../lib/route";

type Filter = "all" | "live" | "settled";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "settled", label: "Ended" },
];

interface Row {
  listing: Listing;
  phase: Phase;
  price: bigint;
}

// Live listings first with verified ones on top, then soonest to end; everything else newest first
function compareRows(a: Row, b: Row): number {
  const liveA = a.phase === "active";
  const liveB = b.phase === "active";
  if (liveA !== liveB) return liveA ? -1 : 1;
  if (liveA) {
    if (a.listing.verified !== b.listing.verified) return a.listing.verified ? -1 : 1;
    return Number(a.listing.endTime - b.listing.endTime);
  }
  return Number(b.listing.id - a.listing.id);
}

function ListingCard({ row, now }: { row: Row; now: bigint }) {
  const { listing, phase, price } = row;
  const needed = ethToSellOut(paramsOf(listing), price);
  const progress = needed === 0n ? 0 : Math.min(100, Number((listing.totalCommitted * 10000n) / needed) / 100);
  const live = phase === "active";

  return (
    <a className="listing" href={launchHref(listing.id)}>
      <div className="listing-head">
        <span className="listing-avatar" aria-hidden="true">
          {listing.symbol.slice(0, 1).toUpperCase()}
        </span>
        <div className="listing-title">
          <strong>{listing.name}</strong>
          <span className="muted">{listing.symbol}</span>
        </div>
        <PhaseBadge phase={phase} />
      </div>
      <div className="listing-tags">
        {listing.verified && <VerifiedBadge />}
        {listing.hidden && <HiddenBadge />}
        <span className="muted mono" title={listing.seller}>
          by {shortAddress(listing.seller)}
        </span>
      </div>
      <dl className="listing-stats">
        <div>
          <dt>{live ? "Price now" : "Final price"}</dt>
          <dd>{formatEth(listing.finalized ? listing.clearingPrice : price, 4)}</dd>
        </div>
        <div>
          <dt>{live ? "Time left" : listing.finalized ? "Sold" : "For sale"}</dt>
          <dd className={live ? "mono" : undefined}>
            {live
              ? formatCountdown(listing.endTime - now)
              : formatToken(listing.finalized ? tokensSoldAt(paramsOf(listing), listing.totalCommitted, listing.clearingPrice) : listing.supply, listing.symbol, 4)}
          </dd>
        </div>
        <div>
          <dt>Committed</dt>
          <dd>{formatEth(listing.totalCommitted, 4)}</dd>
        </div>
      </dl>
      {live && (
        <div className="progress" role="progressbar" aria-label="Share of the ETH needed to sell out" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </a>
  );
}

export function MarketPage({
  listings,
  chainTime,
  fetchedAt,
  isCurator,
}: {
  listings: Listing[];
  chainTime: bigint;
  fetchedAt: number;
  isCurator: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const now = useChainNow({ chainTime, fetchedAt }) ?? chainTime;

  const rows: Row[] = listings
    .filter((listing) => isCurator || !listing.hidden)
    .map((listing) => {
      const params = paramsOf(listing);
      return {
        listing,
        price: priceAt(params, listing.startTime, now),
        phase: phaseOf(params, listing, now),
      };
    })
    .sort(compareRows);

  const liveCount = rows.filter((row) => row.phase === "active").length;
  const shown = rows.filter((row) => (filter === "all" ? true : filter === "live" ? row.phase === "active" : row.phase !== "active"));

  return (
    <>
      <section className="hero">
        <div>
          <h2 className="hero-title">Every launch, one fair price.</h2>
          <p className="muted">
            Each token sells in its own 20-minute Dutch auction. The price falls until demand buys the whole supply,
            everyone pays that same final price, and whatever is unsold is burned for good.
          </p>
        </div>
        <a className="button button-primary hero-action" href="#/create">
          Launch a token
        </a>
      </section>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter listings">
          {FILTERS.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted">
          {liveCount} live · {rows.length} {rows.length === 1 ? "listing" : "listings"}
        </span>
      </div>

      {shown.length === 0 ? (
        <section className="notice">
          <h2>{rows.length === 0 ? "No listings yet" : "Nothing here right now"}</h2>
          <p className="muted">{rows.length === 0 ? "Be the first to launch a token." : "Try another filter."}</p>
        </section>
      ) : (
        <div className="listing-grid">
          {shown.map((row) => (
            <ListingCard key={row.listing.id.toString()} row={row} now={now} />
          ))}
        </div>
      )}
    </>
  );
}
