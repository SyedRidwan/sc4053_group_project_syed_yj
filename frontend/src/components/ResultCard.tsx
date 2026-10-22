import { formatEth, formatNtu } from "../lib/format";
import { Card, Row, type AuctionView } from "./ui";

export function ResultCard({ snapshot }: AuctionView) {
  const { params, clearingPrice, tokensSold, totalCommitted, tokenSupply } = snapshot;
  const burned = params.totalTokens - tokensSold;

  return (
    <Card className="card-result" title="Result" tone="accent">
      <Row label="Clearing price">{formatEth(clearingPrice)} per NTU</Row>
      <Row label="Tokens sold">{formatNtu(tokensSold)}</Row>
      <Row label="Tokens burned">{formatNtu(burned)}</Row>
      <Row label="NTU total supply">{formatNtu(tokenSupply)}</Row>
      <Row label="ETH raised">{formatEth(totalCommitted)}</Row>
    </Card>
  );
}
