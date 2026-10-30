import { useSyncExternalStore } from "react";

export type Route =
  | { page: "market" }
  | { page: "create" }
  | { page: "portfolio" }
  | { page: "launch"; id: bigint }
  | { page: "not-found" };

/** Parses a URL hash. Hash routes need no server support, so every listing has its own link on a static host. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "") return { page: "market" };
  if (path === "create") return { page: "create" };
  if (path === "portfolio") return { page: "portfolio" };
  const launch = /^launch\/(\d+)$/.exec(path);
  return launch ? { page: "launch", id: BigInt(launch[1]) } : { page: "not-found" };
}

export const launchHref = (id: bigint) => `#/launch/${id}`;

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
