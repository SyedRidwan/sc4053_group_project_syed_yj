import { useWatchAsset } from "wagmi";
import { DURATION, ethToSellOut, impliedPrice, tokensSoldAt } from "../lib/auction";
import { formatEth, formatToken, formatUnits18 } from "../lib/format";
import { CopyAddress, Row, type AuctionView } from "./ui";

function Formula({ name, expression, result }: { name: string; expression: string; result: string }) {
  return (
    <div className="formula">
      <span className="formula-name">{name}</span>
      <code>{expression}</code>
      <strong className="formula-result">{result}</strong>
    </div>
  );
}

/** The contract's own sums, filled in with this auction's numbers and updated every second. */
export function UnderTheHood({ listing, snapshot, now, price, phase, account }: AuctionView) {
  const { watchAsset } = useWatchAsset();
  const { params, startTime, totalCommitted } = snapshot;
  const elapsed = now > startTime + DURATION ? DURATION : now - startTime;
  const needed = ethToSellOut(params, price);
  const implied = impliedPrice(params, totalCommitted);
  const clearing = implied > params.reservePrice ? implied : params.reservePrice;
  const sold = tokensSoldAt(params, totalCommitted, clearing);
  const short = (value: bigint) => formatUnits18(value, 6);

  return (
    <details className="hood">
      <summary>
        <span>Under the hood</span>
        <span className="muted">The contract's sums for this auction, live</span>
      </summary>
      <div className="hood-body">
        <Formula
          name="Price now"
          expression={`${short(params.startPrice)} − (${short(params.startPrice)} − ${short(params.reservePrice)}) × ${elapsed} ÷ ${DURATION}`}
          result={formatEth(price)}
        />
        <Formula
          name="ETH to buy everything"
          expression={`${short(params.totalTokens)} ${listing.symbol} × ${short(price)}`}
          result={formatEth(needed)}
        />
        <Formula
          name="Sold out?"
          expression={`committed ${short(totalCommitted)} ≥ needed ${short(needed)}`}
          result={totalCommitted >= needed ? "Yes" : "Not yet"}
        />
        <Formula
          name={phase === "finalized" ? "Clearing price" : "Clearing price if it ended now"}
          expression={`max(reserve ${short(params.reservePrice)}, ${short(totalCommitted)} ÷ ${short(params.totalTokens)})`}
          result={formatEth(phase === "finalized" ? snapshot.clearingPrice : clearing)}
        />
        <Formula
          name={phase === "finalized" ? "Tokens burned" : "Tokens burned if it ended now"}
          expression={`${short(params.totalTokens)} − ${short(sold)} sold`}
          result={formatToken(params.totalTokens - sold, listing.symbol)}
        />
        <div className="hood-contracts">
          <h3>Contracts</h3>
          <Row label="Auction">
            <CopyAddress value={listing.auction} />
          </Row>
          <Row label={`${listing.symbol} token (ERC20)`}>
            <CopyAddress value={listing.token} />
          </Row>
          <Row label="Seller">
            <CopyAddress value={listing.seller} />
          </Row>
          {account && (
            <button
              className="link-button"
              type="button"
              onClick={() => watchAsset({ type: "ERC20", options: { address: listing.token, symbol: listing.symbol, decimals: 18 } })}
            >
              Add {listing.symbol} to wallet
            </button>
          )}
        </div>
        <p className="muted">
          These are the same sums the contract runs. The whole design is explained on the <a href="#/learn">How it works</a> page.
        </p>
      </div>
    </details>
  );
}
