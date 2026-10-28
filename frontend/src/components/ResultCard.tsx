import { formatEth, formatTim } from "../lib/format";
import { Card, Row, type AuctionView } from "./ui";

export function ResultCard({ snapshot }: AuctionView) {
  const { params, clearingPrice, tokensSold, totalCommitted, tokenSupply } = snapshot;
  const burned = params.totalTokens - tokensSold;

  return (
    <Card className="card-result" title="Result" tone="accent">
      <Row label="Clearing price">{formatEth(clearingPrice)} per TIM</Row>
      <Row label="Tokens sold">{formatTim(tokensSold)}</Row>
      <Row label="Tokens burned">{formatTim(burned)}</Row>
      <Row label="TIM total supply">{formatTim(tokenSupply)}</Row>
      <Row label="ETH raised">{formatEth(totalCommitted)}</Row>
    </Card>
  );
}
