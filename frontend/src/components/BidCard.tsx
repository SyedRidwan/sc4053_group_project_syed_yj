import { BidForm } from "./BidForm";
import { Card, type AuctionView } from "./ui";

export function BidCard({ listing, snapshot, price, phase, account }: AuctionView) {
  if (phase !== "active") return null;

  return (
    <Card className="card-bid" title="Place a bid" tone="accent">
      <BidForm
        id="bid-amount"
        listing={listing}
        price={price}
        totalCommitted={snapshot.totalCommitted}
        commitment={snapshot.account?.commitment ?? 0n}
        account={account}
      />
      <p className="field-help">
        The price keeps falling, so the final split is fixed when your transaction is mined. Whatever you bid, everyone pays
        the same final price.
      </p>
    </Card>
  );
}
