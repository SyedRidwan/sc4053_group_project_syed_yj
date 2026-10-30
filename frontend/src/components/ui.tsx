import type { ReactNode } from "react";
import type { Address, Hash } from "viem";
import type { AuctionSnapshot } from "../hooks/useAuction";
import type { Listing } from "../hooks/useLaunches";
import type { TxStatus } from "../hooks/useTx";
import type { Phase } from "../lib/auction";
import { shortAddress } from "../lib/format";

/** Everything a card needs to render the auction at the current chain second. */
export interface AuctionView {
  listing: Listing;
  snapshot: AuctionSnapshot;
  now: bigint;
  price: bigint;
  phase: Phase;
  account?: Address;
}

export function Card({
  title,
  children,
  tone,
  className,
}: {
  title: string;
  children: ReactNode;
  tone?: "accent";
  className?: string;
}) {
  return (
    <section className={["card", tone === "accent" && "card-accent", className].filter(Boolean).join(" ")}>
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

/** A shortened address or transaction hash. */
export function ShortHash({ value, children }: { value: Hash | Address; children?: ReactNode }) {
  return <span className="mono" title={value}>{children ?? shortAddress(value)}</span>;
}

export function TxStatusLine({ status }: { status: TxStatus }) {
  switch (status.state) {
    case "idle":
      return null;
    case "pending":
      return <p className="tx tx-pending">Confirm “{status.label}” in your wallet…</p>;
    case "confirming":
      return (
        <p className="tx tx-pending">
          Waiting for confirmation… <ShortHash value={status.hash} />
        </p>
      );
    case "success":
      return (
        <p className="tx tx-success">
          {status.label} confirmed <ShortHash value={status.hash} />
        </p>
      );
    case "error":
      return (
        <p className="tx tx-error" role="alert">
          {status.label} failed: {status.message}
        </p>
      );
  }
}

const PHASE_LABELS: Record<Phase, string> = {
  "not-started": "Not started",
  active: "Live",
  "sold-out": "Sold out · awaiting settlement",
  ended: "Ended · awaiting settlement",
  finalized: "Settled",
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  return <span className={`badge badge-${phase}`}>{PHASE_LABELS[phase]}</span>;
}

export function VerifiedBadge() {
  return (
    <span className="tag tag-verified" title="Reviewed by the curator. This says nothing about the token's value.">
      Verified
    </span>
  );
}

export function HiddenBadge() {
  return (
    <span className="tag tag-hidden" title="Hidden from the market by the curator. The auction keeps running.">
      Hidden
    </span>
  );
}
