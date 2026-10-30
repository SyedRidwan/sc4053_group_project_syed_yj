import { useWatchAsset } from "wagmi";
import { Card, Row, ShortHash, type AuctionView } from "./ui";

export function ContractsCard({ listing, account }: AuctionView) {
  const { watchAsset } = useWatchAsset();

  return (
    <Card className="card-contracts" title="Contracts">
      <Row label="Auction">
        <ShortHash value={listing.auction} />
      </Row>
      <Row label={`${listing.symbol} token`}>
        <ShortHash value={listing.token} />
      </Row>
      <Row label="Seller">
        <ShortHash value={listing.seller} />
      </Row>
      {account && (
        <button
          className="button button-ghost"
          type="button"
          onClick={() =>
            watchAsset({ type: "ERC20", options: { address: listing.token, symbol: listing.symbol, decimals: 18 } })
          }
        >
          Add {listing.symbol} to wallet
        </button>
      )}
    </Card>
  );
}
