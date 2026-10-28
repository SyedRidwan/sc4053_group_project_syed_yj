import { useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import { minTokens, proRataTokens, TOKEN_UNIT } from "../lib/auction";
import { formatEth, formatTim } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, Row, TxStatusLine, type AuctionView } from "./ui";

export function PositionCard({ deployment, snapshot, price, phase, account }: AuctionView) {
  const chainId = deployment.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);

  if (!account) {
    return (
      <Card className="card-position" title="Your position">
        <p className="muted">Connect a wallet to see your commitment and claim your tokens.</p>
      </Card>
    );
  }

  const position = snapshot.account;
  if (!position) {
    return (
      <Card className="card-position" title="Your position">
        <p className="muted">Loading…</p>
      </Card>
    );
  }

  const { commitment, claimed } = position;
  const { params, totalCommitted } = snapshot;

  // What the connected bidder will receive, as precisely as the current phase allows
  let tokensLabel = "Tokens owed";
  let tokens = 0n;
  if (phase === "finalized") tokens = position.tokensOwed;
  else if (phase === "sold-out") tokens = proRataTokens(params, commitment, totalCommitted);
  else if (phase === "ended") tokens = (commitment * TOKEN_UNIT) / params.reservePrice;
  else if (phase === "active") {
    tokensLabel = "Tokens (at least)";
    tokens = minTokens(commitment, price);
  }

  const settled = phase === "finalized" || phase === "sold-out" || phase === "ended";
  const canClaim = settled && commitment > 0n && !claimed;

  function claim() {
    return tx.run(phase === "finalized" ? "Claim" : "Settle and claim", () =>
      writeContractAsync({ address: deployment.auction.address, abi: dutchAuctionAbi, functionName: "claim", chainId })
    );
  }

  return (
    <Card className="card-position" title="Your position">
      <Row label="ETH committed">{formatEth(commitment)}</Row>
      {commitment > 0n && <Row label={tokensLabel}>{claimed ? "Claimed" : formatTim(tokens)}</Row>}
      {phase === "finalized" && commitment > 0n && <Row label="Price you paid">{formatEth(snapshot.clearingPrice)} per TIM</Row>}
      <Row label="TIM in wallet">{formatTim(position.tokenBalance)}</Row>
      {commitment === 0n && <p className="muted">You have not bid in this auction.</p>}
      {canClaim && (
        <button className="button button-primary" type="button" onClick={claim} disabled={tx.busy}>
          {tx.busy ? "Claiming…" : phase === "finalized" ? "Claim tokens" : "Settle and claim tokens"}
        </button>
      )}
      <TxStatusLine status={tx.status} chainId={chainId} />
    </Card>
  );
}
