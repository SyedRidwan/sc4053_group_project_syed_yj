import { impliedPrice, DURATION, type AuctionParams } from "../lib/auction";

const W = 200;
const H = 56;
const PAD = 5;

/**
 * A small live picture of one auction: the falling price, a dot at the current second, and a dashed line where the ETH
 * committed so far would buy every token. The auction sells out if the dot reaches that line.
 */
export function Curve({
  params,
  elapsed,
  totalCommitted,
  live,
}: {
  params: AuctionParams;
  elapsed: bigint;
  totalCommitted: bigint;
  live: boolean;
}) {
  const range = params.startPrice - params.reservePrice;
  const fraction = Math.min(Math.max(Number(elapsed) / Number(DURATION), 0), 1);
  const x = PAD + fraction * (W - 2 * PAD);
  const y = PAD + fraction * (H - 2 * PAD);

  const implied = impliedPrice(params, totalCommitted);
  const showCapital = implied >= params.reservePrice && implied <= params.startPrice && range > 0n;
  const capitalY = showCapital ? PAD + (Number(((params.startPrice - implied) * 1000n) / range) / 1000) * (H - 2 * PAD) : 0;

  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${Math.round(fraction * 100)}% of the price schedule has passed`}>
      <line className="curve-future" x1={PAD} y1={PAD} x2={W - PAD} y2={H - PAD} />
      {showCapital && <line className="curve-capital" x1={PAD} x2={W - PAD} y1={capitalY} y2={capitalY} />}
      <line className="curve-elapsed" x1={PAD} y1={PAD} x2={x} y2={y} />
      <circle className={live ? "curve-dot curve-dot-live" : "curve-dot"} cx={x} cy={y} r={3.5} />
    </svg>
  );
}
