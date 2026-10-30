import { useEffect, useRef, useState } from "react";
import type { AuctionEvent } from "../hooks/useAuction";
import { DURATION, impliedPrice, offsetForPrice, sellOutOffset, type AuctionParams } from "../lib/auction";
import { formatEth, formatOffset, formatUnits18 } from "../lib/format";
import { Card, type AuctionView } from "./ui";

const SECONDS = Number(DURATION);
const COMPACT_BELOW = 480;

/** Width of an element in CSS pixels, kept up to date as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// The chart is drawn at its real pixel size, so text stays readable at every width
function layout(width: number) {
  const compact = width < COMPACT_BELOW;
  const W = Math.max(width, 280);
  const H = compact ? 220 : 300;
  const pad = compact ? { left: 46, right: 14, top: 22, bottom: 34 } : { left: 76, right: 24, top: 24, bottom: 40 };
  return { W, H, pad, compact, plotW: W - pad.left - pad.right, plotH: H - pad.top - pad.bottom };
}

function makeScales(params: AuctionParams, box: ReturnType<typeof layout>) {
  const range = params.startPrice - params.reservePrice;
  return {
    x: (t: number) => box.pad.left + (Math.min(Math.max(t, 0), SECONDS) / SECONDS) * box.plotW,
    y: (price: bigint) => {
      const clamped = price > params.startPrice ? params.startPrice : price < params.reservePrice ? params.reservePrice : price;
      const fraction = range === 0n ? 0 : Number(((params.startPrice - clamped) * 10_000n) / range) / 10_000;
      return box.pad.top + fraction * box.plotH;
    },
  };
}

export function PriceChart({ view, events }: { view: AuctionView; events: AuctionEvent[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const box = layout(width);
  const { W, H, pad, compact } = box;

  const { listing, snapshot, now, price, phase } = view;
  const { params, startTime, totalCommitted, clearingPrice } = snapshot;
  const { x, y } = makeScales(params, box);

  const implied = impliedPrice(params, totalCommitted);
  const crossing = sellOutOffset(params, totalCommitted);
  const showCapitalLine = phase !== "finalized" && totalCommitted > 0n && implied >= params.reservePrice;
  const midPrice = (params.startPrice + params.reservePrice) / 2n;
  const bids = events.filter((event) => event.eventName === "BidPlaced");

  const clearedAt =
    phase === "finalized" ? (clearingPrice > params.reservePrice ? offsetForPrice(params, clearingPrice) : SECONDS) : null;

  // The solid "elapsed" line stops at the clearing point once settled, otherwise at now
  const elapsedEnd = clearedAt ?? (startTime === 0n ? 0 : Math.min(Number(now - startTime), SECONDS));
  const elapsedPrice = clearedAt !== null ? clearingPrice : price;

  // Keep labels inside the plot: put them on whichever side of their point has room
  const sideOf = (px: number) => (px < W / 2 ? { anchor: "start" as const, dx: 12 } : { anchor: "end" as const, dx: -12 });

  return (
    <Card className="card-chart" title="Price schedule">
      <div ref={ref} className="chart-box">
        <svg
          className="chart"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Price falls from ${formatEth(params.startPrice)} to ${formatEth(params.reservePrice)} over 20 minutes; current price ${formatEth(price)}`}
        >
          {[params.startPrice, midPrice, params.reservePrice].map((tick) => (
            <g key={tick.toString()}>
              <line className="chart-grid" x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
                {formatUnits18(tick, 4)}
              </text>
            </g>
          ))}
          {(compact ? [0, 10, 20] : [0, 5, 10, 15, 20]).map((minute) => (
            <text key={minute} className="chart-axis" x={x(minute * 60)} y={H - pad.bottom + 22} textAnchor="middle">
              {minute}m
            </text>
          ))}
          {!compact && (
            <text
              className="chart-axis"
              x={14}
              y={pad.top + box.plotH / 2}
              transform={`rotate(-90 14 ${pad.top + box.plotH / 2})`}
              textAnchor="middle"
            >
              ETH per {listing.symbol}
            </text>
          )}

          {/* Schedule: the elapsed part solid, the rest dashed */}
          <line className="chart-future" x1={x(0)} y1={y(params.startPrice)} x2={x(SECONDS)} y2={y(params.reservePrice)} />
          {elapsedEnd > 0 && (
            <line className="chart-elapsed" x1={x(0)} y1={y(params.startPrice)} x2={x(elapsedEnd)} y2={y(elapsedPrice)} />
          )}

          {/* The price at which the ETH committed so far buys every token */}
          {showCapitalLine && (
            <g>
              <line className="chart-capital" x1={x(0)} x2={x(SECONDS)} y1={y(implied)} y2={y(implied)} />
              <text className="chart-note" x={pad.left + 8} y={y(implied) - 8} textAnchor="start">
                {compact ? "all tokens at" : "committed ETH buys all tokens at"} {formatUnits18(implied, 4)}
              </text>
              {crossing !== null && (
                <g>
                  <circle className="chart-crossing" cx={x(Number(crossing))} cy={y(implied)} r={6} />
                  <text
                    className="chart-note chart-note-strong"
                    x={x(Number(crossing)) + sideOf(x(Number(crossing))).dx}
                    y={y(implied) + (y(implied) > H - pad.bottom - 40 ? -14 : 24)}
                    textAnchor={sideOf(x(Number(crossing))).anchor}
                  >
                    sells out at {formatOffset(crossing)}
                  </text>
                </g>
              )}
            </g>
          )}

          {bids.map((bid) => (
            <circle
              key={`${bid.transactionHash}-${bid.logIndex}`}
              className="chart-bid"
              cx={x(offsetForPrice(params, bid.args.priceAtBid))}
              cy={y(bid.args.priceAtBid)}
              r={5}
            >
              <title>
                {formatEth(bid.args.ethAccepted)} committed at {formatEth(bid.args.priceAtBid)}
              </title>
            </circle>
          ))}

          {phase === "active" && (
            <g>
              <line className="chart-now" x1={x(elapsedEnd)} x2={x(elapsedEnd)} y1={pad.top} y2={H - pad.bottom} />
              <circle className="chart-now-dot" cx={x(elapsedEnd)} cy={y(price)} r={6} />
            </g>
          )}

          {clearedAt !== null && (
            <g>
              <circle className="chart-crossing" cx={x(clearedAt)} cy={y(clearingPrice)} r={7} />
              <text
                className="chart-note chart-note-strong"
                x={x(clearedAt) + sideOf(x(clearedAt)).dx}
                y={y(clearingPrice)}
                dominantBaseline="middle"
                textAnchor={sideOf(x(clearedAt)).anchor}
              >
                cleared at {formatUnits18(clearingPrice, 4)}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p className="caption">
        {compact && `Prices in ETH per ${listing.symbol}. `}The price falls in a straight line for 20 minutes. The dashed line is the
        price at which the ETH committed so far would buy every token; the auction sells out where the two meet, and
        everyone pays that price.
      </p>
      <ul className="legend">
        <li><span className="swatch swatch-schedule" />Price schedule</li>
        <li><span className="swatch swatch-capital" />Committed-capital price</li>
        <li><span className="swatch swatch-bid" />Bids</li>
      </ul>
    </Card>
  );
}
