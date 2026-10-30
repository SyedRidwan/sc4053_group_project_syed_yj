import type { Address } from "viem";
import { ActivityFeed } from "../components/ActivityFeed";
import { BidCard } from "../components/BidCard";
import { CuratorCard } from "../components/CuratorCard";
import { Lifecycle } from "../components/Lifecycle";
import { Overview } from "../components/Overview";
import { PositionCard } from "../components/PositionCard";
import { PriceChart } from "../components/PriceChart";
import { ResultCard } from "../components/ResultCard";
import { SellerCard } from "../components/SellerCard";
import { SettleCard } from "../components/SettleCard";
import { UnderTheHood } from "../components/UnderTheHood";
import { HiddenBadge, VerifiedBadge, WatchButton, type AuctionView } from "../components/ui";
import { useAuction, useAuctionEvents, useChainNow } from "../hooks/useAuction";
import type { Listing } from "../hooks/useLaunches";
import { errorMessage } from "../hooks/useTx";
import { phaseOf, priceAt, scheduleElapsed } from "../lib/auction";
import { shortAddress } from "../lib/format";

export function LaunchPage({ listing, account, isCurator }: { listing: Listing; account?: Address; isCurator: boolean }) {
  const auction = useAuction(listing, account);
  const events = useAuctionEvents(listing);
  const now = useChainNow(auction.data);

  if (auction.error) {
    return (
      <div className="page">
        <section className="notice">
          <h2>Can't read this auction</h2>
          <p className="mono">{errorMessage(auction.error)}</p>
        </section>
      </div>
    );
  }
  if (!auction.data || now === undefined) {
    return <p className="loading">Loading auction…</p>;
  }

  const snapshot = auction.data;
  const view: AuctionView = {
    listing,
    snapshot,
    now,
    price: priceAt(snapshot.params, snapshot.startTime, snapshot.startTime + scheduleElapsed(snapshot.params, snapshot, now)),
    phase: phaseOf(snapshot.params, snapshot, now),
    account,
  };
  const isSeller = account !== undefined && account.toLowerCase() === listing.seller.toLowerCase();

  return (
    <div className="page">
      <header className="coin-head">
        <a className="back-link" href="#/">
          ← All coins
        </a>
        <div className="coin-title">
          <h2>{listing.name}</h2>
          <span className="coin-symbol">{listing.symbol}</span>
          {listing.verified && <VerifiedBadge />}
          {listing.hidden && <HiddenBadge />}
          <WatchButton id={listing.id} symbol={listing.symbol} />
        </div>
        <p className="muted">
          Listed by <span className="mono">{shortAddress(listing.seller)}</span>
        </p>
      </header>
      <Overview {...view} />
      <Lifecycle phase={view.phase} />
      <div className="layout">
        <div className="layout-main">
          <PriceChart view={view} events={events.data ?? []} />
          <UnderTheHood {...view} />
          <ActivityFeed symbol={listing.symbol} events={events.data ?? []} error={events.error} account={account} />
        </div>
        <aside className="layout-side">
          {view.phase === "finalized" && <ResultCard {...view} />}
          {(view.phase === "sold-out" || view.phase === "ended") && <SettleCard {...view} />}
          <BidCard {...view} />
          <PositionCard {...view} />
          {isSeller && <SellerCard {...view} />}
          {isCurator && <CuratorCard {...view} />}
        </aside>
      </div>
    </div>
  );
}
