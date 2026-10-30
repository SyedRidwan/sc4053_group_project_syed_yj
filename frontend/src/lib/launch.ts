// Client-side copy of LaunchFactory.createLaunch's checks, so the form can explain a problem before the wallet opens.
// Amounts are wei or token-wei; prices are wei per whole token.

import { parseEther } from "viem";
import { ethToSellOut } from "./auction";

export const MIN_SUPPLY = 10n ** 18n;
export const MAX_SUPPLY = 10n ** 33n;
export const MIN_RESERVE = 10n ** 9n;
export const MAX_PRICE = 1000n * 10n ** 18n;
export const MIN_PRICE_RATIO = 2n;
export const MIN_RAISE = 10n ** 15n;
export const MAX_NAME_BYTES = 32;
export const MAX_SYMBOL_BYTES = 11;

export interface LaunchForm {
  name: string;
  symbol: string;
  supply: string;
  startPrice: string;
  reservePrice: string;
}

export interface LaunchInput {
  name: string;
  symbol: string;
  supply: bigint;
  startPrice: bigint;
  reservePrice: bigint;
}

export type LaunchErrors = Partial<Record<keyof LaunchForm, string>>;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

function parseAmount(input: string): bigint | null {
  try {
    return input.trim() === "" ? null : parseEther(input.trim());
  } catch {
    return null;
  }
}

/** Checks a filled-in form. Returns the values to send, or the problem with each field. */
export function validateLaunch(form: LaunchForm): { input: LaunchInput | null; errors: LaunchErrors } {
  const errors: LaunchErrors = {};
  const name = form.name.trim();
  const symbol = form.symbol.trim();
  const supply = parseAmount(form.supply);
  const startPrice = parseAmount(form.startPrice);
  const reservePrice = parseAmount(form.reservePrice);

  if (name === "" || byteLength(name) > MAX_NAME_BYTES) errors.name = `Enter a name of 1 to ${MAX_NAME_BYTES} characters`;
  if (symbol === "" || byteLength(symbol) > MAX_SYMBOL_BYTES) errors.symbol = `Enter a symbol of 1 to ${MAX_SYMBOL_BYTES} characters`;

  if (supply === null) errors.supply = "Enter a number of tokens, like 1000";
  else if (supply < MIN_SUPPLY) errors.supply = "Offer at least 1 token";
  else if (supply > MAX_SUPPLY) errors.supply = "That is more than the maximum of 1,000 trillion tokens";

  if (reservePrice === null) errors.reservePrice = "Enter a price in ETH, like 0.02";
  else if (reservePrice < MIN_RESERVE) errors.reservePrice = "The reserve must be at least 0.000000001 ETH";

  if (startPrice === null) errors.startPrice = "Enter a price in ETH, like 0.1";
  else if (startPrice > MAX_PRICE) errors.startPrice = "The start price can be at most 1,000 ETH";
  else if (reservePrice !== null && startPrice < reservePrice * MIN_PRICE_RATIO) {
    errors.startPrice = "The start price must be at least twice the reserve, so the price really falls";
  }

  if (!errors.supply && !errors.reservePrice && supply !== null && reservePrice !== null) {
    if (ethToSellOut({ totalTokens: supply, startPrice: 0n, reservePrice }, reservePrice) < MIN_RAISE) {
      errors.reservePrice = "Supply times reserve must come to at least 0.001 ETH";
    }
  }

  if (Object.keys(errors).length > 0 || supply === null || startPrice === null || reservePrice === null) {
    return { input: null, errors };
  }
  return { input: { name, symbol, supply, startPrice, reservePrice }, errors };
}
