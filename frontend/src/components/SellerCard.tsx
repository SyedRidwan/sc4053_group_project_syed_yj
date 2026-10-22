import { usePublicClient, useWriteContract } from "wagmi";
import { dutchAuctionAbi, ntuTokenAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import { formatEth, formatNtu } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, Row, TxStatusLine, type AuctionView } from "./ui";

/** Shown only to the seller: start the auction, then withdraw the proceeds once it settles. */
export function SellerCard({ deployment, snapshot, phase, account }: AuctionView) {
  const chainId = deployment.chainId as ChainId;
  const client = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);
  const { params } = snapshot;

  async function start() {
    if (!account || !client) return;
    // start() pulls the supply with transferFrom, so it needs an allowance first
    const allowance = await client.readContract({
      address: deployment.token.address,
      abi: ntuTokenAbi,
      functionName: "allowance",
      args: [account, deployment.auction.address],
    });
    if (allowance < params.totalTokens) {
      const approved = await tx.run("Approve NTU", () =>
        writeContractAsync({
          address: deployment.token.address,
          abi: ntuTokenAbi,
          functionName: "approve",
          args: [deployment.auction.address, params.totalTokens],
          chainId,
        })
      );
      if (!approved) return;
    }
    await tx.run("Start auction", () =>
      writeContractAsync({ address: deployment.auction.address, abi: dutchAuctionAbi, functionName: "start", chainId })
    );
  }

  function withdraw() {
    return tx.run("Withdraw", () =>
      writeContractAsync({
        address: deployment.auction.address,
        abi: dutchAuctionAbi,
        functionName: "withdrawProceeds",
        chainId,
      })
    );
  }

  return (
    <Card className="card-seller" title="Seller">
      {phase === "not-started" && (
        <>
          <Row label="Supply">{formatNtu(params.totalTokens)}</Row>
          <Row label="Start price">{formatEth(params.startPrice)}</Row>
          <Row label="Reserve price">{formatEth(params.reservePrice)}</Row>
          <p className="muted">Starting moves the supply into the auction and opens the 20-minute window.</p>
          <button className="button button-primary" type="button" onClick={start} disabled={tx.busy}>
            {tx.busy ? "Starting…" : "Approve and start auction"}
          </button>
        </>
      )}
      {(phase === "active" || phase === "sold-out" || phase === "ended") && (
        <p className="muted">Proceeds can be withdrawn once the auction is settled.</p>
      )}
      {phase === "finalized" &&
        (snapshot.proceedsWithdrawn ? (
          <p className="muted">Proceeds of {formatEth(snapshot.totalCommitted)} have been withdrawn.</p>
        ) : (
          <button className="button button-primary" type="button" onClick={withdraw} disabled={tx.busy}>
            {tx.busy ? "Withdrawing…" : `Withdraw ${formatEth(snapshot.totalCommitted)}`}
          </button>
        ))}
      <TxStatusLine status={tx.status} chainId={chainId} />
    </Card>
  );
}
