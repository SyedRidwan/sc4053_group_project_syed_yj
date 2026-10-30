import { useAccount, useChainId } from "wagmi";
import { Header } from "./components/Header";
import { Ticker } from "./components/Ticker";
import { deployments, type Deployment } from "./deployments";
import { useLaunches } from "./hooks/useLaunches";
import { errorMessage } from "./hooks/useTx";
import { useRoute, type Route } from "./lib/route";
import { CreatePage } from "./pages/CreatePage";
import { LaunchPage } from "./pages/LaunchPage";
import { LearnPage } from "./pages/LearnPage";
import { MarketPage } from "./pages/MarketPage";
import { PortfolioPage } from "./pages/PortfolioPage";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <section className="notice">
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function NoDeployment({ chainId }: { chainId?: number }) {
  if (chainId === 31337) {
    return (
      <Notice title="The launchpad isn't running yet">
        <p>In the repository root, start the local chain and fill the market:</p>
        <pre>npm run demo</pre>
        <p>This page reloads on its own once the deployment is written.</p>
      </Notice>
    );
  }
  return (
    <Notice title="Wrong network">
      <p>Switch your wallet to the local Hardhat network (chain ID 31337).</p>
    </Notice>
  );
}

function Content({ deployment, route, isCurator }: { deployment: Deployment; route: Route; isCurator: boolean }) {
  const { address: account } = useAccount();
  const launches = useLaunches(deployment);

  if (route.page === "learn") return <LearnPage />;
  if (route.page === "create") return <CreatePage deployment={deployment} account={account} />;
  if (route.page === "not-found") {
    return (
      <Notice title="Page not found">
        <p>
          <a href="#/">Back to the market</a>
        </p>
      </Notice>
    );
  }

  if (launches.error) {
    return (
      <Notice title="Can't read the market">
        <p className="mono">{errorMessage(launches.error)}</p>
        <p>
          Is the local chain running? A restarted chain forgets earlier deployments, so run <code>npm run demo</code> again.
        </p>
      </Notice>
    );
  }
  if (!launches.data) return <p className="loading">Loading the market…</p>;
  const { listings, chainTime, fetchedAt } = launches.data;

  if (route.page === "portfolio") {
    return <PortfolioPage deployment={deployment} listings={listings} chainTime={chainTime} fetchedAt={fetchedAt} account={account} />;
  }
  if (route.page === "launch") {
    const listing = listings.find((candidate) => candidate.id === route.id);
    if (!listing) {
      return (
        <Notice title="No such listing">
          <p>
            <a href="#/">Back to the market</a>
          </p>
        </Notice>
      );
    }
    return <LaunchPage key={listing.auction} listing={listing} account={account} isCurator={isCurator} />;
  }
  return <MarketPage listings={listings} chainTime={chainTime} fetchedAt={fetchedAt} isCurator={isCurator} />;
}

function LiveTape({ deployment }: { deployment: Deployment }) {
  const launches = useLaunches(deployment);
  if (!launches.data) return null;
  return <Ticker listings={launches.data.listings} chainTime={launches.data.chainTime} fetchedAt={launches.data.fetchedAt} />;
}

export default function App() {
  const { address, chainId: walletChainId, isConnected } = useAccount();
  const selectedChainId = useChainId();
  const route = useRoute();
  const chainId = isConnected ? walletChainId : selectedChainId;
  const deployment = chainId !== undefined ? deployments[chainId] : undefined;
  const isCurator = Boolean(deployment && address && address.toLowerCase() === deployment.curator.toLowerCase());

  return (
    <div className="app">
      <Header route={route} isCurator={isCurator} />
      {deployment && <LiveTape key={deployment.factory.address} deployment={deployment} />}
      <main className="main">
        {deployment ? (
          <Content key={deployment.factory.address} deployment={deployment} route={route} isCurator={isCurator} />
        ) : (
          <NoDeployment chainId={chainId} />
        )}
      </main>
      <footer className="footer">
        <span>Horton's. Every winning bidder pays the same clearing price, and unsold tokens are burned.</span>
        <span>SC4053 Blockchain Technology, running on a local test chain</span>
      </footer>
    </div>
  );
}
