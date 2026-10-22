import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState, type FormEvent } from "react";
import { parseEther } from "viem";
import { useBalance, useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import { REFRESH_MS } from "../hooks/useAuction";
import { useTx } from "../hooks/useTx";
import { minTokens, previewBid } from "../lib/auction";
import { formatEth, formatNtu } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Card, Row, TxStatusLine, type AuctionView } from "./ui";

function parseAmount(input: string): bigint | null {
  try {
    return input.trim() === "" ? null : parseEther(input.trim());
  } catch {
    return null;
  }
}

export function BidCard({ deployment, snapshot, price, phase, account }: AuctionView) {
  const chainId = deployment.chainId as ChainId;
  const [amount, setAmount] = useState("");
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);
  const { data: balance } = useBalance({
    address: account,
    chainId,
    query: { enabled: Boolean(account), refetchInterval: REFRESH_MS },
  });

  const value = parseAmount(amount);
  const invalid = amount.trim() !== "" && (value === null || value <= 0n);
  const insufficient = value !== null && balance !== undefined && value > balance.value;
  const preview = value !== null && value > 0n ? previewBid(snapshot.params, price, snapshot.totalCommitted, value) : null;
  const commitment = snapshot.account?.commitment ?? 0n;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      openConnectModal?.();
      return;
    }
    if (value === null || value <= 0n) return;
    const ok = await tx.run("Bid", () =>
      writeContractAsync({
        address: deployment.auction.address,
        abi: dutchAuctionAbi,
        functionName: "bid",
        value,
        chainId,
      })
    );
    if (ok) setAmount("");
  }

  if (phase !== "active") {
    const reason =
      phase === "not-started" ? "Bidding opens when the seller starts the auction." : "Bidding has closed for this auction.";
    return (
      <Card className="card-bid" title="Place a bid">
        <p className="muted">{reason}</p>
        <TxStatusLine status={tx.status} chainId={chainId} />
      </Card>
    );
  }

  return (
    <Card className="card-bid" title="Place a bid" tone="accent">
      <form className="bid-form" onSubmit={submit} noValidate>
        <label className="field-label" htmlFor="bid-amount">
          ETH to commit
        </label>
        <div className={`field${invalid || insufficient ? " field-error" : ""}`}>
          <input
            id="bid-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby="bid-help"
          />
          <span className="field-suffix">ETH</span>
        </div>
        <p id="bid-help" className="field-help">
          {invalid
            ? "Enter a positive amount, like 0.5"
            : insufficient
              ? "That is more than your wallet holds"
              : balance
                ? `Wallet balance: ${formatEth(balance.value, 5)}`
                : "Connect a wallet to bid"}
        </p>

        {preview && !invalid && (
          <div className="preview">
            <Row label="Accepted">{formatEth(preview.accepted)}</Row>
            {preview.refund > 0n && <Row label="Refunded immediately">{formatEth(preview.refund)}</Row>}
            <Row label="You receive at least">{formatNtu(minTokens(commitment + preview.accepted, price))}</Row>
            {preview.sellsOut && (
              <p className="callout">
                This bid sells out the auction at {formatEth(price)} per NTU. The surplus comes back in the same
                transaction, and every bidder pays that price.
              </p>
            )}
          </div>
        )}

        <button className="button button-primary" type="submit" disabled={Boolean(account) && (value === null || invalid || insufficient || tx.busy)}>
          {!account ? "Connect wallet to bid" : tx.busy ? "Bidding…" : "Place bid"}
        </button>
      </form>
      <p className="field-help">
        Preview uses the current price. The price keeps falling, so the final split is fixed when the transaction is
        mined, and everyone pays the same final price.
      </p>
      <TxStatusLine status={tx.status} chainId={chainId} />
    </Card>
  );
}
