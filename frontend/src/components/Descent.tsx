import { useEffect, useRef, useState } from "react";
import { paramsOf, type Listing } from "../hooks/useLaunches";
import { DURATION, phaseOf } from "../lib/auction";
import { launchHref } from "../lib/route";

const HEIGHT = 300;
const WINDOW = 2n * DURATION;
const TOP = 24;
const BOTTOM = 34;
const LABEL_SECONDS = 45;
const LABEL_WIDTH = 64;

/** Every live coin's price falling across one shared clock, with "now" fixed in the middle. Time moves, the line stays. */
export function Descent({ listings, now }: { listings: Listing[]; now: bigint }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const live = listings.filter((listing) => phaseOf(paramsOf(listing), listing, now) === "active");
  const x = (time: bigint) => (width * (Number(time - now) + Number(WINDOW) / 2)) / Number(WINDOW);
  const y = (fraction: number) => TOP + fraction * (HEIGHT - TOP - BOTTOM);
  const nowX = width / 2;

  return (
    <div ref={ref} className="descent">
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`${live.length} live auctions, each with its price falling for 20 minutes`}>
        <line className="descent-now" x1={nowX} x2={nowX} y1={0} y2={HEIGHT - BOTTOM + 6} />
        <text className="descent-axis" x={nowX} y={HEIGHT - 8} textAnchor="middle">
          now
        </text>
        <text className="descent-axis" x={nowX - width / 4} y={HEIGHT - 8} textAnchor="middle">
          −10 min
        </text>
        <text className="descent-axis" x={nowX + width / 4} y={HEIGHT - 8} textAnchor="middle">
          +10 min
        </text>
        {live.map((listing) => {
          const dotY = y(Number(now - listing.startTime) / Number(DURATION));
          // Coins started moments apart sit on the same spot, so their labels stack instead of overprinting
          const stacked = live.filter((other) => other.id < listing.id && Math.abs(Number(other.startTime - listing.startTime)) < LABEL_SECONDS).length;
          return (
            <a key={listing.id.toString()} href={launchHref(listing.id)}>
              <line className="descent-line" x1={x(listing.startTime)} y1={y(0)} x2={x(listing.endTime)} y2={y(1)} />
              <circle className="descent-dot" cx={nowX} cy={dotY} r={5} />
              <text className="descent-label" x={nowX + 12 + stacked * LABEL_WIDTH} y={dotY - 8}>
                {listing.symbol}
              </text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
