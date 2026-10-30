import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { Address } from "viem";
import { Card, PhaseBadge } from "../components/ui";
import type { Deployment } from "../deployments";
import { useChainNow } from "../hooks/useAuction";
import { paramsOf, usePositions, type Listing } from "../hooks/useLaunches";
import { phaseOf, type Phase } from "../lib/auction";
import { formatEth, formatToken } from "../lib/format";
import { launchHref } from "../lib/route";

function ListingLink({ listing }: { listing: Listing }) {
  return (
    <a href={launchHref(listing.id)}>
      <strong>{listing.name}</strong> <span className="muted">{listing.symbol}</span>
    </a>
  );
}

function ActionLink({ listing, children }: { listing: Listing; children: string }) {
  return (
    <a className="table-action" href={launchHref(listing.id)}>
      {children}
    </a>
  );
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
  const now = useChainNow({ chainTime, fetchedAt }) ?? chainTime;

  if (!account) {
    return (
      <section className="notice">
        <h2>Connect a wallet to see your portfolio</h2>
        <p className="muted">Your wallet is your account here. There is nothing to sign up for.</p>
        <button className="button button-primary" type="button" onClick={() => openConnectModal?.()}>
          Connect wallet
        </button>
      </section>
    );
  }

  const phaseFor = (listing: Listing): Phase => phaseOf(paramsOf(listing), listing, now);
  const myListings = listings.filter((listing) => listing.seller.toLowerCase() === account.toLowerCase());
  const myBids = listings.filter((listing) => (positions.data?.get(listing.id)?.commitment ?? 0n) > 0n);
  const held = listings.filter((listing) => (positions.data?.get(listing.id)?.tokenBalance ?? 0n) > 0n);
  const committed = myBids.reduce((sum, listing) => sum + (positions.data?.get(listing.id)?.commitment ?? 0n), 0n);
  const toClaim = myBids.filter((listing) => {
    const position = positions.data?.get(listing.id);
    return position && !position.claimed && phaseFor(listing) !== "active";
  }).length;

  return (
    <>
      <div className="page-title">
        <div className="page-heading">
          <h2>Your portfolio</h2>
        </div>
      </div>

      <section className="overview overview-portfolio" aria-label="Portfolio summary">
        <div className="stat">
          <span className="stat-label">Listings you bid on</span>
          <span className="stat-value">{myBids.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">ETH committed</span>
          <span className="stat-value">{formatEth(committed)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Ready to claim</span>
          <span className="stat-value">{toClaim}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Your listings</span>
          <span className="stat-value">{myListings.length}</span>
        </div>
      </section>

      <div className="stack">
        <Card className="card-my-bids" title="Your bids">
          {myBids.length === 0 ? (
            <p className="muted">
              You have not bid yet. <a href="#/">Browse the market</a>.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Status</th>
                    <th className="numeric">Committed</th>
                    <th className="numeric">Tokens</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {myBids.map((listing) => {
                    const position = positions.data?.get(listing.id);
                    if (!position) return null;
                    const phase = phaseFor(listing);
                    return (
                      <tr key={listing.id.toString()}>
                        <td>
                          <ListingLink listing={listing} />
                        </td>
                        <td>
                          <PhaseBadge phase={phase} />
                        </td>
                        <td className="numeric">{formatEth(position.commitment)}</td>
                        <td className="numeric">
                          {position.claimed
                            ? "Claimed"
                            : phase === "finalized"
                              ? formatToken(position.tokensOwed, listing.symbol)
                              : "Set at settlement"}
                        </td>
                        <td className="numeric">
                          <ActionLink listing={listing}>{!position.claimed && phase !== "active" ? "Claim" : "Open"}</ActionLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="card-my-listings" title="Your listings">
          {myListings.length === 0 ? (
            <p className="muted">
              You have not launched a token yet. <a href="#/create">Launch one</a>.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Status</th>
                    <th className="numeric">ETH raised</th>
                    <th className="numeric">Proceeds</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {myListings.map((listing) => {
                    const phase = phaseFor(listing);
                    const canWithdraw = listing.finalized && !listing.proceedsWithdrawn;
                    return (
                      <tr key={listing.id.toString()}>
                        <td>
                          <ListingLink listing={listing} />
                        </td>
                        <td>
                          <PhaseBadge phase={phase} />
                        </td>
                        <td className="numeric">{formatEth(listing.totalCommitted)}</td>
                        <td className="numeric">
                          {listing.proceedsWithdrawn ? "Withdrawn" : canWithdraw ? "Ready" : "After settlement"}
                        </td>
                        <td className="numeric">
                          <ActionLink listing={listing}>{canWithdraw ? "Withdraw" : "Open"}</ActionLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="card-holdings" title="Tokens in your wallet">
          {held.length === 0 ? (
            <p className="muted">Tokens you claim will appear here.</p>
          ) : (
            <ul className="holdings">
              {held.map((listing) => (
                <li key={listing.id.toString()}>
                  <ListingLink listing={listing} />
                  <span>{formatToken(positions.data?.get(listing.id)?.tokenBalance ?? 0n, listing.symbol)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
