import type { Address } from "viem";
import { ActivityFeed } from "../components/ActivityFeed";
import { BidCard } from "../components/BidCard";
import { ContractsCard } from "../components/ContractsCard";
import { CuratorCard } from "../components/CuratorCard";
import { Overview } from "../components/Overview";
import { PositionCard } from "../components/PositionCard";
import { PriceChart } from "../components/PriceChart";
import { ResultCard } from "../components/ResultCard";
import { SellerCard } from "../components/SellerCard";
import { SettleCard } from "../components/SettleCard";
import { HiddenBadge, VerifiedBadge, type AuctionView } from "../components/ui";
import { useAuction, useAuctionEvents, useChainNow } from "../hooks/useAuction";
import type { Listing } from "../hooks/useLaunches";
import { errorMessage } from "../hooks/useTx";
import { phaseOf, priceAt } from "../lib/auction";

export function LaunchPage({ listing, account, isCurator }: { listing: Listing; account?: Address; isCurator: boolean }) {
  const auction = useAuction(listing, account);
  const events = useAuctionEvents(listing);
  const now = useChainNow(auction.data);

  if (auction.error) {
    return (
      <section className="notice">
        <h2>Can't read this auction</h2>
        <p className="mono">{errorMessage(auction.error)}</p>
      </section>
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
    price: priceAt(snapshot.params, snapshot.startTime, now),
    phase: phaseOf(snapshot.params, snapshot, now),
    account,
  };
  const isSeller = account !== undefined && account.toLowerCase() === listing.seller.toLowerCase();

  return (
    <>
      <div className="page-title">
        <a className="back-link" href="#/">
          ← Market
        </a>
        <div className="page-heading">
          <h2>
            {listing.name} <span className="muted">{listing.symbol}</span>
          </h2>
          {listing.verified && <VerifiedBadge />}
          {listing.hidden && <HiddenBadge />}
        </div>
      </div>
      <Overview {...view} />
      <div className="layout">
        <div className="layout-main">
          <PriceChart view={view} events={events.data ?? []} />
          <ActivityFeed symbol={listing.symbol} events={events.data ?? []} error={events.error} account={account} />
        </div>
        <div className="layout-side">
          {view.phase === "finalized" && <ResultCard {...view} />}
          {(view.phase === "sold-out" || view.phase === "ended") && <SettleCard {...view} />}
          <BidCard {...view} />
          <PositionCard {...view} />
          {isSeller && <SellerCard {...view} />}
          {isCurator && <CuratorCard {...view} />}
          <ContractsCard {...view} />
        </div>
      </div>
    </>
  );
}
