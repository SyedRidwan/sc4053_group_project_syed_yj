import { useChainNow } from "../hooks/useAuction";
import { paramsOf, type Listing } from "../hooks/useLaunches";
import { phaseOf, priceAt } from "../lib/auction";
import { formatCountdown, formatUnits18 } from "../lib/format";
import { launchHref } from "../lib/route";

const MIN_ITEMS_FOR_LOOP = 8;

/** A tape of every live coin's price. It repeats its items so the loop never shows a gap. */
export function Ticker({ listings, chainTime, fetchedAt }: { listings: Listing[]; chainTime: bigint; fetchedAt: number }) {
  const now = useChainNow({ chainTime, fetchedAt }) ?? chainTime;
  const live = listings.filter((listing) => !listing.hidden && phaseOf(paramsOf(listing), listing, now) === "active");
  if (live.length === 0) return null;

  const copies = Math.max(1, Math.ceil(MIN_ITEMS_FOR_LOOP / live.length));
  const items = Array.from({ length: copies }, () => live).flat();

  const strip = (hidden: boolean) => (
    <ul className="ticker-strip" aria-hidden={hidden || undefined}>
      {items.map((listing, index) => (
        <li key={`${listing.id}-${index}`}>
          <a href={launchHref(listing.id)} tabIndex={hidden || index >= live.length ? -1 : undefined}>
            <strong>{listing.symbol}</strong>
            <span className="mono">{formatUnits18(priceAt(paramsOf(listing), listing.startTime, now), 4)} ETH</span>
            <span className="mono ticker-time">{formatCountdown(listing.endTime - now)}</span>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ticker" role="region" aria-label="Live prices">
      <div className="ticker-track">
        {strip(false)}
        {strip(true)}
      </div>
    </div>
  );
}
