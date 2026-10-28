import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { deployments } from "../deployments";

export function Header() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { chains, switchChain } = useSwitchChain();

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1 className="brand-title">Horton's Token Launch</h1>
          <p className="brand-sub">Uniform-price Dutch auction</p>
        </div>
      </div>
      <div className="header-actions">
        {/* Before a wallet connects, this picks which network to read from */}
        {!isConnected && (
          <div className="segmented" role="group" aria-label="Network">
            {chains.map((chain) => (
              <button
                key={chain.id}
                type="button"
                aria-pressed={chain.id === chainId}
                onClick={() => switchChain({ chainId: chain.id })}
                title={deployments[chain.id] ? "Auction deployed" : "No deployment yet"}
              >
                {chain.id === 31337 ? "Local" : chain.name}
                {!deployments[chain.id] && <span className="segmented-hint"> · none</span>}
              </button>
            ))}
          </div>
        )}
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      </div>
    </header>
  );
}
