import { useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import { impliedPrice, TOKEN_UNIT } from "../lib/auction";
import { formatEth, formatNtu } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, TxStatusLine, type AuctionView } from "./ui";

/** Shown once the auction has sold out or expired but nobody has settled it yet. */
export function SettleCard({ deployment, snapshot, account }: AuctionView) {
  const chainId = deployment.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);

  // Same settlement maths as _finalize(): clearing price, tokens sold, and the rest burned
  const { params, totalCommitted } = snapshot;
  const implied = impliedPrice(params, totalCommitted);
  const clearing = implied > params.reservePrice ? implied : params.reservePrice;
  const sold = (totalCommitted * TOKEN_UNIT) / clearing;
  const tokensSold = sold < params.totalTokens ? sold : params.totalTokens;
  const burned = params.totalTokens - tokensSold;

  return (
    <Card className="card-settle" title="Settle the auction" tone="accent">
      <p>
        Bidding is over. Settling fixes the clearing price at <strong>{formatEth(clearing)}</strong> per NTU
        {burned > 0n ? (
          <>
            {" "}and permanently burns <strong>{formatNtu(burned)}</strong> that did not sell.
          </>
        ) : (
          "."
        )}{" "}
        Anyone can do this; the first claim also does it automatically.
      </p>
      <button
        className="button"
        type="button"
        disabled={!account || tx.busy}
        onClick={() =>
          tx.run("Settle", () =>
            writeContractAsync({ address: deployment.auction.address, abi: dutchAuctionAbi, functionName: "finalize", chainId })
          )
        }
      >
        {!account ? "Connect a wallet to settle" : tx.busy ? "Settling…" : "Settle auction"}
      </button>
      <TxStatusLine status={tx.status} chainId={chainId} />
    </Card>
  );
}
