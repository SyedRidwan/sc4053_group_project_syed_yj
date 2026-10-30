import type { Phase } from "../lib/auction";

const STEPS = ["Bidding", "Settlement", "Claims"] as const;

function stepIndex(phase: Phase): number {
  if (phase === "finalized") return 2;
  if (phase === "sold-out" || phase === "ended") return 1;
  return 0;
}

const NEXT: Record<Phase, string> = {
  "not-started": "Waiting to start.",
  active: "Bids are open. The auction ends when committed ETH buys the whole supply, or after 20 minutes.",
  "sold-out": "Bidding is over. Anyone can settle now, and the first claim does it automatically.",
  ended: "Time is up. Anyone can settle now, and the first claim does it automatically.",
  finalized: "The final price is fixed. Bidders can claim their tokens, and the seller can withdraw the ETH.",
};

/** Where this auction is in its life, and what can happen next. */
export function Lifecycle({ phase }: { phase: Phase }) {
  const current = stepIndex(phase);
  return (
    <div className="lifecycle">
      <ol className="lifecycle-steps">
        {STEPS.map((step, index) => (
          <li key={step} className={index < current ? "step step-done" : index === current ? "step step-current" : "step"} aria-current={index === current ? "step" : undefined}>
            {step}
          </li>
        ))}
      </ol>
      <p className="lifecycle-next">{NEXT[phase]}</p>
    </div>
  );
}
