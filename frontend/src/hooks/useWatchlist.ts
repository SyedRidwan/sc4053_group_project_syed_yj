import { useSyncExternalStore } from "react";

const STORAGE_KEY = "watchlist";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return memory;
  }
}

// Used only when the browser blocks storage, so the star still works until the page reloads
let memory = "";

function write(ids: string[]) {
  memory = ids.join(",");
  try {
    localStorage.setItem(STORAGE_KEY, memory);
  } catch {
    // Kept in memory above
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Coins this browser is following. A personal convenience, so it stays on this device and never touches the chain. */
export function useWatchlist() {
  const raw = useSyncExternalStore(subscribe, read);
  const ids = raw === "" ? [] : raw.split(",");
  return {
    isWatched: (id: bigint) => ids.includes(id.toString()),
    toggle: (id: bigint) => {
      const key = id.toString();
      write(ids.includes(key) ? ids.filter((other) => other !== key) : [...ids, key]);
    },
  };
}
