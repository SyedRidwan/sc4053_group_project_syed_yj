import { useState } from "react";
import { Curve } from "../components/Curve";
import { Descent } from "../components/Descent";
import { HiddenBadge, PhaseBadge, VerifiedBadge, WatchButton } from "../components/ui";
import { useChainNow } from "../hooks/useAuction";
import { paramsOf, type Listing } from "../hooks/useLaunches";
import { ethToSellOut, phaseOf, priceAt, tokensSoldAt, type Phase } from "../lib/auction";
import { formatCountdown, formatEth, formatToken, formatUnits18, shortAddress } from "../lib/format";
import { launchHref } from "../lib/route";

type Filter = "all" | "live" | "ended";
type Sort = "ending" | "committed" | "newest";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "ended", label: "Ended" },
];

const URGENT_SECONDS = 60n;

interface Item {
  listing: Listing;
  phase: Phase;
  price: bigint;
}

// Live coins always come first; the chosen order applies within each group
function compareItems(a: Item, b: Item, sort: Sort): number {
  const liveA = a.phase === "active";
  const liveB = b.phase === "active";
  if (liveA !== liveB) return liveA ? -1 : 1;
  if (sort === "committed" && a.listing.totalCommitted !== b.listing.totalCommitted) {
    return a.listing.totalCommitted > b.listing.totalCommitted ? -1 : 1;
  }
  if (sort === "ending" && liveA) {
    if (a.listing.verified !== b.listing.verified) return a.listing.verified ? -1 : 1;
    return Number(a.listing.endTime - b.listing.endTime);
  }
  return Number(b.listing.id - a.listing.id);
}

function CoinRow({ item, now, index }: { item: Item; now: bigint; index: number }) {
  const { listing, phase, price } = item;
  const params = paramsOf(listing);
  const live = phase === "active";
  const needed = ethToSellOut(params, price);
  const progress = needed === 0n ? 0 : Math.min(100, Number((listing.totalCommitted * 10000n) / needed) / 100);
  const remaining = listing.endTime - now;
  const elapsed = now - listing.startTime;
  const sold = tokensSoldAt(params, listing.totalCommitted, listing.clearingPrice);

  return (
    <li className="coin" style={{ "--i": index } as React.CSSProperties}>
      <a className="coin-link" href={launchHref(listing.id)} aria-label={`${listing.name}, ${listing.symbol}`} />
      <div className="coin-id">
        <span className="coin-ticker">{listing.symbol}</span>
        <span className="coin-name">
          {listing.name}
          {listing.verified && <VerifiedBadge />}
          {listing.hidden && <HiddenBadge />}
        </span>
        <span className="coin-seller mono">{shortAddress(listing.seller)}</span>
      </div>
      <div className="coin-curve">
        <Curve params={params} elapsed={elapsed} totalCommitted={listing.totalCommitted} live={live} />
      </div>
      <div className="coin-stat">
        <span className="coin-stat-label">{live ? "Price now" : "Final price"}</span>
        <span className="coin-price">{formatUnits18(listing.finalized ? listing.clearingPrice : price, 4)} ETH</span>
      </div>
      <div className="coin-stat">
        {live ? (
          <>
            <span className="coin-stat-label">Time left</span>
            <span className={`coin-time mono${remaining < URGENT_SECONDS ? " figure-urgent" : ""}`}>{formatCountdown(remaining)}</span>
          </>
        ) : (
          <>
            <span className="coin-stat-label">{listing.finalized ? "Sold" : "For sale"}</span>
            <span className="coin-time">{formatToken(listing.finalized ? sold : listing.supply, listing.symbol, 4)}</span>
          </>
        )}
      </div>
      <div className="coin-stat coin-demand">
        <span className="coin-stat-label">Committed</span>
        <span className="coin-time">{formatEth(listing.totalCommitted, 4)}</span>
        {live ? (
          <span className="coin-bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : (
          <PhaseBadge phase={phase} />
        )}
      </div>
      <div className="coin-actions">
        <WatchButton id={listing.id} symbol={listing.symbol} />
        <span className="coin-arrow" aria-hidden="true">
          →
        </span>
      </div>
    </li>
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
  const [sort, setSort] = useState<Sort>("ending");
  const [search, setSearch] = useState("");
  const now = useChainNow({ chainTime, fetchedAt }) ?? chainTime;

  const visible = listings.filter((listing) => isCurator || !listing.hidden);
  const items: Item[] = visible.map((listing) => {
    const params = paramsOf(listing);
    return { listing, price: priceAt(params, listing.startTime, now), phase: phaseOf(params, listing, now) };
  });

  const live = items.filter((item) => item.phase === "active");
  const committed = visible.reduce((sum, listing) => sum + listing.totalCommitted, 0n);
  const settled = visible.filter((listing) => listing.finalized);
  const query = search.trim().toLowerCase();

  const shown = items
    .filter((item) => (filter === "all" ? true : filter === "live" ? item.phase === "active" : item.phase !== "active"))
    .filter((item) => query === "" || item.listing.name.toLowerCase().includes(query) || item.listing.symbol.toLowerCase().includes(query))
    .sort((a, b) => compareItems(a, b, sort));

  return (
    <>
      <section className="hero">
        <div className="hero-text page-inner">
          <h2>
            The price falls
            <br />
            until the market <em>says yes.</em>
          </h2>
          <p>
            Every coin here sells in its own 20-minute Dutch auction. Bid whenever you like: everyone ends up paying the same
            final price, and whatever doesn't sell is burned for good.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#/create">
              Launch a token
            </a>
            <a className="button" href="#/learn">
              How it works
            </a>
          </div>
        </div>
        <Descent listings={visible} now={now} />
      </section>

      <div className="page">
        <dl className="pulse">
          <div>
            <dt>Live now</dt>
            <dd>{live.length}</dd>
          </div>
          <div>
            <dt>Listed so far</dt>
            <dd>{visible.length}</dd>
          </div>
          <div>
            <dt>ETH committed</dt>
            <dd>{formatUnits18(committed, 5)}</dd>
          </div>
          <div>
            <dt>Auctions settled</dt>
            <dd>{settled.length}</dd>
          </div>
        </dl>

        <div className="toolbar">
          <div className="filters" role="group" aria-label="Filter coins">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search coins"
            aria-label="Search coins by name or symbol"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="sort">
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="ending">Ending soon</option>
              <option value="committed">Most committed</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>

        {shown.length === 0 ? (
          <section className="notice">
            <h2>{visible.length === 0 ? "No coins yet" : "Nothing matches"}</h2>
            <p className="muted">{visible.length === 0 ? "Be the first to launch a token." : "Try another filter or search."}</p>
          </section>
        ) : (
          <ul className="coins">
            {shown.map((item, index) => (
              <CoinRow key={item.listing.id.toString()} item={item} now={now} index={index} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
