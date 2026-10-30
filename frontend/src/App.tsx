import { useAccount, useChainId } from "wagmi";
import { Header } from "./components/Header";
import { deployments, type Deployment } from "./deployments";
import { useLaunches } from "./hooks/useLaunches";
import { errorMessage } from "./hooks/useTx";
import { useRoute, type Route } from "./lib/route";
import { CreatePage } from "./pages/CreatePage";
import { LaunchPage } from "./pages/LaunchPage";
import { MarketPage } from "./pages/MarketPage";
import { PortfolioPage } from "./pages/PortfolioPage";

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

function Pages({ deployment, route, isCurator }: { deployment: Deployment; route: Route; isCurator: boolean }) {
  const { address: account } = useAccount();
  const launches = useLaunches(deployment);

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
      <main className="main">
        {deployment ? (
          <Pages key={deployment.factory.address} deployment={deployment} route={route} isCurator={isCurator} />
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
