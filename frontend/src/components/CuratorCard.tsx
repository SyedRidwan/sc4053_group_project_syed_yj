import { useWriteContract } from "wagmi";
import { launchFactoryAbi } from "../abi";
import { useTx } from "../hooks/useTx";
import type { ChainId } from "../wagmi";
import { Card, TxStatusLine, type AuctionView } from "./ui";

/** Shown only to the curator. These two flags only change what the site displays; no auction reads them. */
export function CuratorCard({ listing }: AuctionView) {
  const chainId = listing.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);

  function setFlag(functionName: "setHidden" | "setVerified", label: string, value: boolean) {
    return tx.run(label, () =>
      writeContractAsync({
        address: listing.factory,
        abi: launchFactoryAbi,
        functionName,
        args: [listing.id, value],
        chainId,
      })
    );
  }

  return (
    <Card className="card-curator" title="Curator">
      <p className="muted">
        You can label this listing or hide it from the market. You cannot touch its funds, price or clock.
      </p>
      <button
        className="button"
        type="button"
        disabled={tx.busy}
        onClick={() => setFlag("setVerified", listing.verified ? "Remove verification" : "Verify", !listing.verified)}
      >
        {listing.verified ? "Remove verified badge" : "Mark as verified"}
      </button>
      <button
        className="button"
        type="button"
        disabled={tx.busy}
        onClick={() => setFlag("setHidden", listing.hidden ? "Unhide" : "Hide", !listing.hidden)}
      >
        {listing.hidden ? "Show on market" : "Hide from market"}
      </button>
      <TxStatusLine status={tx.status} />
    </Card>
  );
}
