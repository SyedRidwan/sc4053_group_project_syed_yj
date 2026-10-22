import type { ReactNode } from "react";
import type { Address, Hash } from "viem";
import type { Deployment } from "../deployments";
import { explorers } from "../deployments";
import type { AuctionSnapshot } from "../hooks/useAuction";
import type { TxStatus } from "../hooks/useTx";
import type { Phase } from "../lib/auction";
import { shortAddress } from "../lib/format";

/** Everything a card needs to render the auction at the current chain second. */
export interface AuctionView {
  deployment: Deployment;
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

export function ExplorerLink({
  chainId,
  kind,
  value,
  children,
}: {
  chainId: number;
  kind: "tx" | "address";
  value: Hash | Address;
  children?: ReactNode;
}) {
  const base = explorers[chainId];
  const label = children ?? shortAddress(value);
  if (!base) return <span className="mono">{label}</span>;
  return (
    <a className="mono" href={`${base}/${kind}/${value}`} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

export function TxStatusLine({ status, chainId }: { status: TxStatus; chainId: number }) {
  switch (status.state) {
    case "idle":
      return null;
    case "pending":
      return <p className="tx tx-pending">Confirm “{status.label}” in your wallet…</p>;
    case "confirming":
      return (
        <p className="tx tx-pending">
          Waiting for confirmation… <ExplorerLink chainId={chainId} kind="tx" value={status.hash} />
        </p>
      );
    case "success":
      return (
        <p className="tx tx-success">
          {status.label} confirmed <ExplorerLink chainId={chainId} kind="tx" value={status.hash} />
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
