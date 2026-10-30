import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Route } from "../lib/route";
import { setTheme, useTheme } from "../lib/theme";

const LINKS = [
  { href: "#/", label: "Market", page: "market" },
  { href: "#/portfolio", label: "Portfolio", page: "portfolio" },
  { href: "#/create", label: "Launch a token", page: "create" },
  { href: "#/learn", label: "How it works", page: "learn" },
] as const;

function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="theme-toggle" type="button" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

export function Header({ route, isCurator }: { route: Route; isCurator: boolean }) {
  return (
    <header className="header">
      <a className="brand" href="#/">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 6 L28 26" />
          <circle cx="20" cy="19.3" r="4" />
        </svg>
        <span className="brand-title">Horton's</span>
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
        <ThemeToggle />
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      </div>
    </header>
  );
}
