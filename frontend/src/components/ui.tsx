import { useState, type ReactNode } from "react";
import type { Address, Hash } from "viem";
import type { AuctionSnapshot } from "../hooks/useAuction";
import type { WalletAdd } from "../hooks/useClaim";
import type { Listing } from "../hooks/useLaunches";
import { useWatchlist } from "../hooks/useWatchlist";
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

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

/** A word with a plain-language definition on hover or keyboard focus. */
export function Term({ children, means }: { children: ReactNode; means: string }) {
  return (
    <span className="term" tabIndex={0}>
      {children}
      <span className="term-tip" role="tooltip">
        {means}
      </span>
    </span>
  );
}

/** A shortened address or transaction hash. */
export function ShortHash({ value, children }: { value: Hash | Address; children?: ReactNode }) {
  return <span className="mono" title={value}>{children ?? shortAddress(value)}</span>;
}

export function CopyAddress({ value }: { value: Address }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="copy" type="button" onClick={copy} title={`Copy ${value}`}>
      <span className="mono">{shortAddress(value)}</span>
      <span className="copy-hint">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
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

export function WalletAddLine({ state, symbol, onRetry }: { state: WalletAdd; symbol: string; onRetry: () => void }) {
  switch (state) {
    case "idle":
      return null;
    case "asking":
      return <p className="tx tx-pending">Approve adding {symbol} in your wallet…</p>;
    case "added":
      return <p className="tx tx-success">{symbol} now shows in your wallet</p>;
    case "declined":
      return (
        <p className="tx tx-pending">
          Your tokens are claimed, but {symbol} is not listed in your wallet yet.{" "}
          <button className="link-button" type="button" onClick={onRetry}>
            Add {symbol} to wallet
          </button>
        </p>
      );
  }
}

const PHASE_LABELS: Record<Phase, string> = {
  "not-started": "Not started",
  active: "Live",
  "sold-out": "Sold out, needs settling",
  ended: "Ended, needs settling",
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

export function WatchButton({ id, symbol }: { id: bigint; symbol: string }) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(id);
  return (
    <button
      className={watched ? "watch watch-on" : "watch"}
      type="button"
      aria-pressed={watched}
      aria-label={`${watched ? "Stop tracking" : "Track"} ${symbol}`}
      title={watched ? "Tracking on your Portfolio page" : "Track on your Portfolio page"}
      onClick={() => toggle(id)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z" />
      </svg>
    </button>
  );
}
