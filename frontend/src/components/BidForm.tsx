import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState, type FormEvent } from "react";
import { formatEther, parseEther, type Address } from "viem";
import { useBalance, useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import { REFRESH_MS } from "../hooks/useAuction";
import type { Listing } from "../hooks/useLaunches";
import { paramsOf } from "../hooks/useLaunches";
import { useTx } from "../hooks/useTx";
import { ethToSellOut, minTokens, previewBid } from "../lib/auction";
import { formatEth, formatToken } from "../lib/format";
import type { ChainId } from "../wagmi";
import { Row, TxStatusLine } from "./ui";

const QUICK_AMOUNTS = ["1", "5", "10"];

function parseAmount(input: string): bigint | null {
  try {
    return input.trim() === "" ? null : parseEther(input.trim());
  } catch {
    return null;
  }
}

export function BidForm({
  id,
  listing,
  price,
  totalCommitted,
  commitment,
  account,
}: {
  id: string;
  listing: Listing;
  price: bigint;
  totalCommitted: bigint;
  commitment: bigint;
  account?: Address;
}) {
  const chainId = listing.chainId as ChainId;
  const [amount, setAmount] = useState("");
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);
  const { data: balance } = useBalance({
    address: account,
    chainId,
    query: { enabled: Boolean(account), refetchInterval: REFRESH_MS },
  });

  const params = paramsOf(listing);
  const value = parseAmount(amount);
  const invalid = amount.trim() !== "" && (value === null || value <= 0n);
  const insufficient = value !== null && balance !== undefined && value > balance.value;
  // A bid worth less than 1 token-wei would be owed nothing (spec section 4)
  const dust = value !== null && value > 0n && minTokens(value, price) === 0n;
  const preview = value !== null && value > 0n ? previewBid(params, price, totalCommitted, value) : null;
  const room = ethToSellOut(params, price) - totalCommitted;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      openConnectModal?.();
      return;
    }
    if (value === null || value <= 0n || dust) return;
    const ok = await tx.run("Bid", () =>
      writeContractAsync({ address: listing.auction, abi: dutchAuctionAbi, functionName: "bid", value, chainId })
    );
    if (ok) setAmount("");
  }

  return (
    <form className="bid-form" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor={id}>
        ETH to commit
      </label>
      <div className={`field${invalid || insufficient || dust ? " field-error" : ""}`}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-describedby={`${id}-help`}
        />
        <span className="field-suffix">ETH</span>
      </div>
      <div className="chips" role="group" aria-label="Quick amounts">
        {QUICK_AMOUNTS.map((quick) => (
          <button key={quick} className="chip" type="button" onClick={() => setAmount(quick)}>
            {quick}
          </button>
        ))}
        {room > 0n && (
          <button className="chip" type="button" onClick={() => setAmount(formatEther(room))}>
            Buy the rest
          </button>
        )}
      </div>
      <p id={`${id}-help`} className="field-help">
        {invalid
          ? "Enter a positive amount, like 0.5"
          : dust
            ? "That is too small to buy any tokens"
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
          <Row label="You receive at least">{formatToken(minTokens(commitment + preview.accepted, price), listing.symbol)}</Row>
          {preview.sellsOut && (
            <p className="callout">
              This bid sells out the auction at {formatEth(price)} per {listing.symbol}. The surplus comes back in the same
              transaction, and every bidder pays that price.
            </p>
          )}
        </div>
      )}

      <button className="button button-primary" type="submit" disabled={Boolean(account) && (value === null || invalid || insufficient || dust || tx.busy)}>
        {!account ? "Connect wallet to bid" : tx.busy ? "Bidding…" : "Place bid"}
      </button>
      <TxStatusLine status={tx.status} />
    </form>
  );
}
