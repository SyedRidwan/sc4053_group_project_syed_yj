import type { ReactNode } from "react";
import type { Address } from "viem";
import type { AuctionEvent } from "../hooks/useAuction";
import { formatEth, formatToken, shortAddress } from "../lib/format";
import { Card, ShortHash } from "./ui";

const MAX_ITEMS = 25;

function Who({ address, account }: { address: Address; account?: Address }) {
  const isYou = account !== undefined && address.toLowerCase() === account.toLowerCase();
  return <span className={isYou ? "you" : "mono"}>{isYou ? "You" : shortAddress(address)}</span>;
}

function describe(event: AuctionEvent, symbol: string, account?: Address): { kind: string; text: ReactNode } {
  switch (event.eventName) {
    case "AuctionStarted":
      return { kind: "start", text: "Auction started" };
    case "BidPlaced":
      return {
        kind: "bid",
        text: (
          <>
            <Who address={event.args.bidder} account={account} /> committed {formatEth(event.args.ethAccepted)} at{" "}
            {formatEth(event.args.priceAtBid)}
            {event.args.ethRefunded > 0n && <> · {formatEth(event.args.ethRefunded)} refunded</>}
          </>
        ),
      };
    case "AuctionFinalized":
      return {
        kind: "settle",
        text: (
          <>
            Settled at {formatEth(event.args.clearingPrice)} · {formatToken(event.args.tokensSold, symbol)} sold ·{" "}
            {formatToken(event.args.tokensBurned, symbol)} burned
          </>
        ),
      };
    case "TokensClaimed":
      return {
        kind: "claim",
        text: (
          <>
            <Who address={event.args.bidder} account={account} /> claimed {formatToken(event.args.amount, symbol)}
          </>
        ),
      };
    case "ProceedsWithdrawn":
      return { kind: "withdraw", text: <>Seller withdrew {formatEth(event.args.amount)}</> };
  }
}

export function ActivityFeed({
  symbol,
  events,
  error,
  account,
}: {
  symbol: string;
  events: AuctionEvent[];
  error: Error | null;
  account?: Address;
}) {
  const recent = [...events].reverse().slice(0, MAX_ITEMS);

  return (
    <Card className="card-activity" title="Activity">
      {error && <p className="tx tx-error">Could not load events: {error.message}</p>}
      {!error && recent.length === 0 && <p className="muted">No activity yet.</p>}
      <ol className="activity">
        {recent.map((event) => {
          const { kind, text } = describe(event, symbol, account);
          return (
            <li key={`${event.transactionHash}-${event.logIndex}`} className={`activity-item activity-${kind}`}>
              <span className="activity-dot" aria-hidden="true" />
              <span className="activity-text">{text}</span>
              <ShortHash value={event.transactionHash}>#{event.blockNumber.toString()}</ShortHash>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
