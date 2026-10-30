import { useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import { impliedPrice, tokensSoldAt } from "../lib/auction";
import { formatEth, formatToken } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, TxStatusLine, type AuctionView } from "./ui";

/** Shown once the auction has sold out or expired but nobody has settled it yet. */
export function SettleCard({ listing, snapshot, account }: AuctionView) {
  const chainId = listing.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);

  // Same settlement maths as _finalize(): clearing price, tokens sold, and the rest burned
  const { params, totalCommitted } = snapshot;
  const implied = impliedPrice(params, totalCommitted);
  const clearing = implied > params.reservePrice ? implied : params.reservePrice;
  const burned = params.totalTokens - tokensSoldAt(params, totalCommitted, clearing);

  return (
    <Card className="card-settle" title="Settle the auction" tone="accent">
      <p>
        Bidding is over. Settling fixes the clearing price at <strong>{formatEth(clearing)}</strong> per {listing.symbol}
        {burned > 0n ? (
          <>
            {" "}and permanently burns <strong>{formatToken(burned, listing.symbol)}</strong> that did not sell.
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
            writeContractAsync({ address: listing.auction, abi: dutchAuctionAbi, functionName: "finalize", chainId })
          )
        }
      >
        {!account ? "Connect a wallet to settle" : tx.busy ? "Settling…" : "Settle auction"}
      </button>
      <TxStatusLine status={tx.status} />
    </Card>
  );
}
