import { formatEth, formatToken } from "../lib/format";
import { Card, Row, type AuctionView } from "./ui";

export function ResultCard({ listing, snapshot }: AuctionView) {
  const { params, clearingPrice, tokensSold, totalCommitted, tokenSupply } = snapshot;
  const burned = params.totalTokens - tokensSold;

  return (
    <Card className="card-result" title="Result" tone="accent">
      <Row label="Clearing price">{formatEth(clearingPrice)} per {listing.symbol}</Row>
      <Row label="Tokens sold">{formatToken(tokensSold, listing.symbol)}</Row>
      <Row label="Tokens burned">{formatToken(burned, listing.symbol)}</Row>
      <Row label={`${listing.symbol} total supply`}>{formatToken(tokenSupply, listing.symbol)}</Row>
      <Row label="ETH raised">{formatEth(totalCommitted)}</Row>
    </Card>
  );
}
