import { useWriteContract } from "wagmi";
import { launchFactoryAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import { formatEth } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, TxStatusLine, type AuctionView } from "./ui";

/** Shown only to the listing's seller. The factory checks the same thing on-chain. */
export function SellerCard({ listing, snapshot, phase }: AuctionView) {
  const chainId = listing.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);

  function withdraw() {
    return tx.run("Withdraw", () =>
      writeContractAsync({
        address: listing.factory,
        abi: launchFactoryAbi,
        functionName: "withdrawProceeds",
        args: [listing.id],
        chainId,
      })
    );
  }

  return (
    <Card className="card-seller" title="You are the seller">
      {phase !== "finalized" && <p className="muted">Proceeds can be withdrawn once the auction is settled.</p>}
      {phase === "finalized" &&
        (snapshot.proceedsWithdrawn ? (
          <p className="muted">Proceeds of {formatEth(snapshot.totalCommitted)} have been withdrawn.</p>
        ) : (
          <button className="button button-primary" type="button" onClick={withdraw} disabled={tx.busy}>
            {tx.busy ? "Withdrawing…" : `Withdraw ${formatEth(snapshot.totalCommitted)}`}
          </button>
        ))}
      <TxStatusLine status={tx.status} />
    </Card>
  );
}
