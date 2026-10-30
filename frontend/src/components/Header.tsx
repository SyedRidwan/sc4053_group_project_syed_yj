import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Route } from "../lib/route";

const LINKS = [
  { href: "#/", label: "Market", page: "market" },
  { href: "#/create", label: "Launch a token", page: "create" },
  { href: "#/portfolio", label: "Portfolio", page: "portfolio" },
] as const;

export function Header({ route, isCurator }: { route: Route; isCurator: boolean }) {
  return (
    <header className="header">
      <a className="brand" href="#/">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1 className="brand-title">Horton's Launchpad</h1>
          <p className="brand-sub">Fair-price Dutch auction token launches</p>
        </div>
      </a>
      <nav className="nav" aria-label="Main">
        {LINKS.map((link) => (
          <a
            key={link.page}
            className="nav-link"
            href={link.href}
            aria-current={route.page === link.page || (link.page === "market" && route.page === "launch") ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        {isCurator && <span className="tag tag-role">Curator</span>}
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      </div>
    </header>
  );
}
