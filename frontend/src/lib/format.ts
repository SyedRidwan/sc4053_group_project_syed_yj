import { formatEther } from "viem";

/** Formats a wei (or token-wei) amount for display, keeping up to `digits` significant digits. */
export function formatUnits18(value: bigint, digits = 6): string {
  const number = Number(formatEther(value));
  if (number === 0) return "0";
  return number.toLocaleString("en-US", { maximumSignificantDigits: digits });
}

export function formatEth(value: bigint, digits = 6): string {
  return `${formatUnits18(value, digits)} ETH`;
}

export function formatToken(value: bigint, symbol: string, digits = 6): string {
  return `${formatUnits18(value, digits)} ${symbol}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Formats an offset into the auction as "18m 45s". */
export function formatOffset(seconds: bigint): string {
  const s = seconds > 0n ? seconds : 0n;
  const rest = s % 60n;
  return rest === 0n ? `${s / 60n}m` : `${s / 60n}m ${rest}s`;
}

/** Formats seconds as m:ss. */
export function formatCountdown(seconds: bigint): string {
  const s = seconds > 0n ? seconds : 0n;
  return `${s / 60n}:${(s % 60n).toString().padStart(2, "0")}`;
}
