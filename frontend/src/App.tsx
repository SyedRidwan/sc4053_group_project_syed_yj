import type { Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { ActivityFeed } from "./components/ActivityFeed";
import { BidCard } from "./components/BidCard";
import { ContractsCard } from "./components/ContractsCard";
import { Header } from "./components/Header";
import { Overview } from "./components/Overview";
import { PositionCard } from "./components/PositionCard";
import { PriceChart } from "./components/PriceChart";
import { ResultCard } from "./components/ResultCard";
import { SellerCard } from "./components/SellerCard";
import { SettleCard } from "./components/SettleCard";
import type { AuctionView } from "./components/ui";
import { deployments, type Deployment } from "./deployments";
import { useAuction, useAuctionEvents, useChainNow } from "./hooks/useAuction";
import { errorMessage } from "./hooks/useTx";
import { phaseOf, priceAt } from "./lib/auction";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="notice">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function NoDeployment({ chainId }: { chainId?: number }) {
  if (chainId === 31337) {
    return (
      <Notice title="No local auction yet">
        <p>In the repository root, start a local chain and deploy a demo auction:</p>
        <pre>npm run node{"\n"}npm run demo:local</pre>
        <p>This page reloads on its own once the deployment is written.</p>
      </Notice>
    );
  }
  if (chainId === 11155111) {
    return (
      <Notice title="No Sepolia deployment yet">
        <p>Deploy and start the auction from the repository root (see the README for wallet setup):</p>
        <pre>npm run deploy:sepolia{"\n"}npm run start:sepolia</pre>
      </Notice>
    );
  }
  return (
    <Notice title="Unsupported network">
      <p>Switch your wallet to the local Hardhat chain or to Sepolia.</p>
    </Notice>
  );
}

function AuctionScreen({ deployment, account }: { deployment: Deployment; account?: Address }) {
  const auction = useAuction(deployment, account);
  const events = useAuctionEvents(deployment);
  const now = useChainNow(auction.data);

  if (auction.error) {
    return (
      <Notice title="Can't read the auction">
        <p className="mono">{errorMessage(auction.error)}</p>
        {deployment.chainId === 31337 && (
          <p>
            Is the local chain running? A restarted node forgets earlier deployments, so run <code>npm run node</code> and
            then <code>npm run demo:local</code> again.
          </p>
        )}
      </Notice>
    );
  }
  if (!auction.data || now === undefined) {
    return <p className="loading">Loading auction…</p>;
  }

  const snapshot = auction.data;
  const view: AuctionView = {
    deployment,
    snapshot,
    now,
    price: priceAt(snapshot.params, snapshot.startTime, now),
    phase: phaseOf(snapshot.params, snapshot, now),
    account,
  };
  const isSeller = account !== undefined && account.toLowerCase() === snapshot.seller.toLowerCase();

  return (
    <>
      <Overview {...view} />
      <div className="layout">
        <div className="layout-main">
          <PriceChart view={view} events={events.data ?? []} />
          <ActivityFeed chainId={deployment.chainId} events={events.data ?? []} error={events.error} account={account} />
        </div>
        <div className="layout-side">
          {view.phase === "finalized" && <ResultCard {...view} />}
          {(view.phase === "sold-out" || view.phase === "ended") && <SettleCard {...view} />}
          <BidCard {...view} />
          <PositionCard {...view} />
          {isSeller && <SellerCard {...view} />}
          <ContractsCard {...view} />
        </div>
      </div>
    </>
  );
}

export default function App() {
  const { address, chainId: walletChainId, isConnected } = useAccount();
  const selectedChainId = useChainId();
  const chainId = isConnected ? walletChainId : selectedChainId;
  const deployment = chainId !== undefined ? deployments[chainId] : undefined;

  return (
    <div className="app">
      <Header />
      <main className="main">
        {deployment ? (
          <AuctionScreen key={deployment.auction.address} deployment={deployment} account={address} />
        ) : (
          <NoDeployment chainId={chainId} />
        )}
      </main>
      <footer className="footer">
        SC4053 Blockchain Technology · Every winning bidder pays the same clearing price; unsold tokens are burned.
      </footer>
    </div>
  );
}
