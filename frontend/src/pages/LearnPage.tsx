import { useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { DURATION, type AuctionParams } from "../lib/auction";
import { formatCountdown, formatEth, formatUnits18 } from "../lib/format";
import { effectivePrice, simulate } from "../lib/simulate";

const PARAMS: AuctionParams = { totalTokens: parseEther("1000"), startPrice: parseEther("0.1"), reservePrice: parseEther("0.02") };
const SECONDS = Number(DURATION);
const PLAY_SECONDS_PER_TICK = 12;
const PLAY_TICK_MS = 60;

const W = 640;
const H = 240;
const PAD = { left: 44, right: 14, top: 14, bottom: 28 };

function Simulator() {
  const [alice, setAlice] = useState(30);
  const [bob, setBob] = useState(15);
  const [you, setYou] = useState(15);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  const bids = useMemo(
    () => [
      { name: "Alice", eth: parseEther(String(alice)) },
      { name: "Bob", eth: parseEther(String(bob)) },
      { name: "You", eth: parseEther(String(you)) },
    ],
    [alice, bob, you]
  );
  const result = simulate(PARAMS, bids, BigInt(elapsed));
  const stopAt = Math.min(Number(result.endsAt), SECONDS);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed((current) => {
        const next = current + PLAY_SECONDS_PER_TICK;
        if (next >= stopAt) {
          setPlaying(false);
          return stopAt;
        }
        return next;
      });
    }, PLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, stopAt]);

  const shownAt = Math.min(elapsed, stopAt);
  const x = (t: number) => PAD.left + (t / SECONDS) * (W - PAD.left - PAD.right);
  const y = (price: bigint) => {
    const range = PARAMS.startPrice - PARAMS.reservePrice;
    const clamped = price > PARAMS.startPrice ? PARAMS.startPrice : price < PARAMS.reservePrice ? PARAMS.reservePrice : price;
    return PAD.top + (Number(((PARAMS.startPrice - clamped) * 10000n) / range) / 10000) * (H - PAD.top - PAD.bottom);
  };
  const capital = (result.totalCommitted * 10n ** 18n) / PARAMS.totalTokens;
  const shownPrice = simulate(PARAMS, bids, BigInt(shownAt)).price;

  let verdict: string;
  if (!result.over) {
    verdict = `${formatCountdown(BigInt(SECONDS - shownAt))} left. The ${formatEth(result.totalCommitted)} committed would buy every token at ${formatUnits18(capital, 4)} ETH, and the price is still ${formatEth(shownPrice, 4)}.`;
  } else if (result.endsAt < DURATION) {
    verdict = `Sold out after ${formatCountdown(result.endsAt)}, where the falling price met the committed ETH. Everyone pays ${formatEth(result.clearingPrice, 4)} per token.`;
  } else {
    verdict = `Time ran out before it sold out. It settles at the ${formatEth(result.clearingPrice, 4)} reserve, and ${formatUnits18(result.tokensBurned, 5)} unsold tokens are burned for good.`;
  }

  function changeBid(setter: (value: number) => void, value: number) {
    setter(value);
    setPlaying(false);
    setElapsed(0);
  }

  function play() {
    if (elapsed >= stopAt) setElapsed(0);
    setPlaying(!playing);
  }

  return (
    <div className="sim">
      <div className="sim-controls">
        <p className="muted">1,000 tokens, falling from 0.1 to 0.02 ETH. Three people bid at the start. Change what they bid, then press play.</p>
        {[
          { label: "Alice bids", value: alice, set: setAlice },
          { label: "Bob bids", value: bob, set: setBob },
          { label: "You bid", value: you, set: setYou },
        ].map(({ label, value, set }) => (
          <label key={label} className="slider">
            <span>
              {label} <strong>{value} ETH</strong>
            </span>
            <input type="range" min={0} max={60} step={1} value={value} onChange={(event) => changeBid(set, Number(event.target.value))} />
          </label>
        ))}
        <label className="slider">
          <span>
            Time <strong className="mono">{formatCountdown(BigInt(shownAt))}</strong> of 20:00
          </span>
          <input
            type="range"
            min={0}
            max={SECONDS}
            step={1}
            value={shownAt}
            onChange={(event) => {
              setPlaying(false);
              setElapsed(Math.min(Number(event.target.value), stopAt));
            }}
          />
        </label>
        <button className="button button-primary" type="button" onClick={play}>
          {playing ? "Pause" : elapsed >= stopAt ? "Play again" : "Play the auction"}
        </button>
      </div>

      <div className="sim-output">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The price falling over 20 minutes, against the price at which the committed ETH buys every token">
          {[PARAMS.startPrice, PARAMS.reservePrice].map((tick) => (
            <text key={tick.toString()} className="chart-axis" x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">
              {formatUnits18(tick, 3)}
            </text>
          ))}
          {[0, 10, 20].map((minute) => (
            <text key={minute} className="chart-axis" x={x(minute * 60)} y={H - 8} textAnchor="middle">
              {minute}m
            </text>
          ))}
          <line className="chart-future" x1={x(0)} y1={y(PARAMS.startPrice)} x2={x(SECONDS)} y2={y(PARAMS.reservePrice)} />
          {capital >= PARAMS.reservePrice && <line className="chart-capital" x1={x(0)} x2={x(SECONDS)} y1={y(capital)} y2={y(capital)} />}
          <line className="chart-elapsed" x1={x(0)} y1={y(PARAMS.startPrice)} x2={x(shownAt)} y2={y(shownPrice)} />
          <circle className={result.over ? "chart-crossing" : "chart-now-dot"} cx={x(shownAt)} cy={y(shownPrice)} r={6} />
        </svg>
        <p className={result.over ? "sim-verdict sim-verdict-over" : "sim-verdict"} aria-live="polite">
          {verdict}
        </p>
        {result.over && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th className="numeric">Accepted</th>
                  <th className="numeric">Refunded</th>
                  <th className="numeric">Tokens</th>
                  <th className="numeric">Paid per token</th>
                </tr>
              </thead>
              <tbody>
                {result.bidders
                  .filter((bidder) => bidder.accepted > 0n || bidder.refund > 0n)
                  .map((bidder) => (
                    <tr key={bidder.name}>
                      <td>{bidder.name}</td>
                      <td className="numeric">{formatEth(bidder.accepted, 4)}</td>
                      <td className="numeric">{formatEth(bidder.refund, 4)}</td>
                      <td className="numeric">{formatUnits18(bidder.tokens, 5)}</td>
                      <td className="numeric">{formatEth(effectivePrice(bidder.accepted, bidder.tokens), 4)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  { title: "A seller launches", text: "One transaction creates an ERC20 token and its auction, moves the whole supply in, and starts a 20-minute clock." },
  { title: "The price falls", text: "It drops in a straight line from the start price to the reserve. It is worked out from the block's timestamp, so nobody has to update it." },
  { title: "Bidders commit ETH", text: "A bid doesn't fix a price or a quantity. It adds to the pool of ETH that will share the supply." },
  { title: "The market clears", text: "As soon as the pool buys every token at the current price, the auction ends. A bid that crosses that line is refunded its surplus in the same transaction." },
  { title: "Or time runs out", text: "After 20 minutes, it settles at the reserve price and the tokens that didn't sell are burned, which lowers the total supply for good." },
  { title: "Everyone settles up", text: "Each bidder claims a share at the one clearing price, and the seller withdraws exactly the ETH committed." },
];

const FAQ = [
  { q: "If I bid early at a high price, do I overpay?", a: "No. Your bid is ETH in a pool, not a purchase at that moment's price. Everyone pays the same final clearing price, so an early bidder gets more tokens for their ETH if the price ends lower." },
  { q: "Why not just wait for the lowest price?", a: "Because the auction can sell out before then. If enough ETH arrives, the price stops falling there and it's over. Waiting only works if nobody else wants the coin." },
  { q: "What happens to tokens nobody buys?", a: "They are burned: destroyed by the contract, so the token's total supply really falls. Nobody keeps them, including the seller." },
  { q: "Can the seller or the curator take my money?", a: "No. Only the contract holds the ETH and tokens. A seller can only withdraw once the auction has settled, and only what bidders committed. The curator can hide a listing or mark it verified, and has no path to funds, prices or running auctions." },
  { q: "Does \"Verified\" mean a coin is a good investment?", a: "No. It means the curator has looked at the listing. It says nothing about the token's value. Anyone can launch a coin here with any name, so always check the address." },
  { q: "Why does my wallet ask me to add a token after I claim?", a: "The site adds the coin to your wallet for you, but a wallet always asks its owner to approve a new token. No site can skip that. If you say no, your tokens are still yours, and you can add them later." },
  { q: "MetaMask said \"Transaction failed\", but it worked. Why?", a: "This can happen on a local test chain after a restart: MetaMask remembers old transactions with the same numbers. Clear its activity for the account after each restart. The status line on this site reads the real result from the chain." },
];

const SAFETY = [
  { title: "Reentrancy", text: "State is written before any ETH moves, and every function that moves ETH or tokens is locked against re-entry. Test attackers try to break in and fail." },
  { title: "No loops over bidders", text: "Each bidder claims for themselves, so one bidder can't block another, and a popular auction can't run out of gas settling." },
  { title: "Tracked amounts only", text: "The contract pays out what it recorded, never its raw balance, so ETH forced into it can't change anyone's payout." },
  { title: "Factory-made tokens only", text: "Sellers can't bring their own token. Unusual tokens with fees or no burn can break claims, and one locked ETH permanently in testing." },
  { title: "Fixed rules", text: "Sellers choose the supply and prices within limits, but never the 20 minutes or the curve. Nothing can be upgraded after launch." },
];

export function LearnPage() {
  return (
    <div className="page learn">
      <header className="learn-head">
        <h2>
          A fair price, <em>found in public.</em>
        </h2>
        <p>
          Fixed-price token sales reward whoever pays the most gas and gets there first. Bots win, and the price is a guess. A
          Dutch auction starts high and lets the market decide where it stops.
        </p>
      </header>

      <section className="learn-section">
        <h3>Try it</h3>
        <Simulator />
      </section>

      <section className="learn-section">
        <h3>From launch to claim</h3>
        <ol className="timeline">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="timeline-number">{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="learn-section">
        <h3>The technical part</h3>
        <div className="arch">
          <svg viewBox="0 0 760 210" role="img" aria-label="A wallet calls LaunchFactory, which creates a token and an auction for each listing. Bidders call the auction directly.">
            <g className="arch-node">
              <text x="70" y="44">Seller's wallet</text>
              <text x="70" y="164">Bidder's wallet</text>
              <text x="310" y="44" className="arch-strong">LaunchFactory</text>
              <text x="310" y="62" className="arch-note">creates listings, forwards proceeds</text>
              <text x="620" y="44" className="arch-strong">HortonsToken</text>
              <text x="620" y="62" className="arch-note">one ERC20 per listing</text>
              <text x="620" y="164" className="arch-strong">DutchAuction</text>
              <text x="620" y="182" className="arch-note">one per listing: price, bids, burn</text>
            </g>
            <g className="arch-edge">
              <line x1="125" y1="40" x2="225" y2="40" markerEnd="url(#arrow)" />
              <line x1="395" y1="40" x2="550" y2="40" markerEnd="url(#arrow)" />
              <line x1="370" y1="70" x2="545" y2="150" markerEnd="url(#arrow)" />
              <line x1="130" y1="160" x2="545" y2="160" markerEnd="url(#arrow)" />
              <line x1="620" y1="145" x2="620" y2="75" markerEnd="url(#arrow)" />
            </g>
            <g className="arch-note">
              <text x="175" y="30" textAnchor="middle">createLaunch</text>
              <text x="470" y="30" textAnchor="middle">deploys</text>
              <text x="395" y="118" textAnchor="middle">deploys, starts</text>
              <text x="330" y="150" textAnchor="middle">bid, claim</text>
              <text x="630" y="115">burns unsold</text>
            </g>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className="arch-head" />
              </marker>
            </defs>
          </svg>
        </div>

        <div className="formulas">
          <div>
            <h4>Price at time t</h4>
            <code>P(t) = start − (start − reserve) × t ÷ 1200</code>
            <p>Multiplying before dividing avoids rounding drift. Nothing is stored, so there is nothing to keep up to date.</p>
          </div>
          <div>
            <h4>When it sells out</h4>
            <code>committed ≥ supply × P(t)</code>
            <p>The bid that crosses this line is accepted up to the room left, and the rest is refunded in the same transaction.</p>
          </div>
          <div>
            <h4>The clearing price</h4>
            <code>max(reserve, committed ÷ supply)</code>
            <p>Each bidder receives their commitment as a share of the tokens sold, so claims can never add up to more than exist.</p>
          </div>
        </div>

        <h4 className="learn-subhead">How it stays safe</h4>
        <dl className="safety">
          {SAFETY.map((item) => (
            <div key={item.title}>
              <dt>{item.title}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="learn-section">
        <h3>Questions</h3>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="learn-cta">
        <a className="button button-primary" href="#/">
          Browse live coins
        </a>
        <a className="button" href="#/create">
          Launch a token
        </a>
      </section>
    </div>
  );
}
