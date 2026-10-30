import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
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
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      </div>
    </header>
  );
}
