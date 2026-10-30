import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { launchFactoryAbi } from "../abi";
import type { Deployment } from "../deployments";
import type { AuctionParams } from "../lib/auction";
import type { ChainId } from "../wagmi";
import { REFRESH_MS } from "./useAuction";

const PAGE_SIZE = 50n;

/** One listing as the factory reports it, plus where it lives. */
export interface Listing {
  chainId: number;
  factory: Address;
  id: bigint;
  token: Address;
  auction: Address;
  seller: Address;
  createdBlock: bigint;
  hidden: boolean;
  verified: boolean;
  name: string;
  symbol: string;
  supply: bigint;
  startPrice: bigint;
  reservePrice: bigint;
  currentPrice: bigint;
  totalCommitted: bigint;
  clearingPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  finalized: boolean;
  proceedsWithdrawn: boolean;
}

export interface Position {
  id: bigint;
  commitment: bigint;
  tokensOwed: bigint;
  claimed: boolean;
  tokenBalance: bigint;
}

export const paramsOf = (listing: Listing): AuctionParams => ({
  totalTokens: listing.supply,
  startPrice: listing.startPrice,
  reservePrice: listing.reservePrice,
});

/** Reads every listing from the factory, a page at a time. One call per page, so it stays cheap as the market grows. */
export function useLaunches(deployment: Deployment) {
  const chainId = deployment.chainId as ChainId;
  const client = usePublicClient({ chainId });
  const factory = deployment.factory.address;

  return useQuery({
    queryKey: ["launches", chainId, factory],
    enabled: Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client) throw new Error("No RPC client for this network");
      const block = await client.getBlock({ blockTag: "pending" }).catch(() => client.getBlock());

      const listings: Listing[] = [];
      for (let offset = 0n; ; offset += PAGE_SIZE) {
        const page = await client.readContract({
          address: factory,
          abi: launchFactoryAbi,
          functionName: "getLaunches",
          args: [offset, PAGE_SIZE],
        });
        listings.push(...page.map((row) => ({ ...row, chainId, factory })));
        if (BigInt(page.length) < PAGE_SIZE) break;
      }
      return { listings, chainTime: block.timestamp, fetchedAt: Date.now() };
    },
  });
}

/** An account's stake in every listing, keyed by listing id. */
export function usePositions(deployment: Deployment, account?: Address) {
  const chainId = deployment.chainId as ChainId;
  const client = usePublicClient({ chainId });
  const factory = deployment.factory.address;

  return useQuery({
    queryKey: ["positions", chainId, factory, account],
    enabled: Boolean(client && account),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client || !account) throw new Error("No wallet connected");
      const positions = new Map<bigint, Position>();
      for (let offset = 0n; ; offset += PAGE_SIZE) {
        const page = await client.readContract({
          address: factory,
          abi: launchFactoryAbi,
          functionName: "getPositions",
          args: [account, offset, PAGE_SIZE],
        });
        for (const position of page) positions.set(position.id, position);
        if (BigInt(page.length) < PAGE_SIZE) break;
      }
      return positions;
    },
  });
}
