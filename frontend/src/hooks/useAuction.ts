import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { dutchAuctionAbi, hortonsTokenAbi } from "../abi";
import type { Deployment } from "../deployments";
import type { AuctionParams } from "../lib/auction";
import type { ChainId } from "../wagmi";

export const REFRESH_MS = 4000;

export interface AccountPosition {
  commitment: bigint;
  tokensOwed: bigint;
  claimed: boolean;
  tokenBalance: bigint;
}

export interface AuctionSnapshot {
  seller: Address;
  params: AuctionParams;
  startTime: bigint;
  endTime: bigint;
  totalCommitted: bigint;
  clearingPrice: bigint;
  tokensSold: bigint;
  finalized: boolean;
  proceedsWithdrawn: boolean;
  tokenSupply: bigint;
  /** Timestamp the next block will get, i.e. the chain's "now" when this snapshot was read */
  chainTime: bigint;
  /** Local wall-clock time of the read, used to tick chainTime forward between refreshes */
  fetchedAt: number;
  account?: AccountPosition;
}

/** Reads the whole auction state, plus the connected account's position, every few seconds. */
export function useAuction(deployment: Deployment, account?: Address) {
  const chainId = deployment.chainId as ChainId;
  const client = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["auction", chainId, deployment.auction.address, account],
    enabled: Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<AuctionSnapshot> => {
      if (!client) throw new Error("No RPC client for this network");
      const auction = { address: deployment.auction.address, abi: dutchAuctionAbi } as const;
      const token = { address: deployment.token.address, abi: hortonsTokenAbi } as const;

      // A pending block carries the timestamp the next transaction will see. On a local
      // chain that has been fast-forwarded, the latest block's timestamp can lag far behind.
      const block = await client.getBlock({ blockTag: "pending" }).catch(() => client.getBlock());

      const [
        seller,
        totalTokens,
        startPrice,
        reservePrice,
        startTime,
        endTime,
        totalCommitted,
        clearingPrice,
        tokensSold,
        finalized,
        proceedsWithdrawn,
        tokenSupply,
      ] = await Promise.all([
        client.readContract({ ...auction, functionName: "seller" }),
        client.readContract({ ...auction, functionName: "totalTokens" }),
        client.readContract({ ...auction, functionName: "startPrice" }),
        client.readContract({ ...auction, functionName: "reservePrice" }),
        client.readContract({ ...auction, functionName: "startTime" }),
        client.readContract({ ...auction, functionName: "endTime" }),
        client.readContract({ ...auction, functionName: "totalCommitted" }),
        client.readContract({ ...auction, functionName: "clearingPrice" }),
        client.readContract({ ...auction, functionName: "tokensSold" }),
        client.readContract({ ...auction, functionName: "finalized" }),
        client.readContract({ ...auction, functionName: "proceedsWithdrawn" }),
        client.readContract({ ...token, functionName: "totalSupply" }),
      ]);

      let position: AccountPosition | undefined;
      if (account) {
        const [commitment, tokensOwed, claimed, tokenBalance] = await Promise.all([
          client.readContract({ ...auction, functionName: "commitments", args: [account] }),
          client.readContract({ ...auction, functionName: "tokensOf", args: [account] }),
          client.readContract({ ...auction, functionName: "claimed", args: [account] }),
          client.readContract({ ...token, functionName: "balanceOf", args: [account] }),
        ]);
        position = { commitment, tokensOwed, claimed, tokenBalance };
      }

      return {
        seller,
        params: { totalTokens, startPrice, reservePrice },
        startTime,
        endTime,
        totalCommitted,
        clearingPrice,
        tokensSold,
        finalized,
        proceedsWithdrawn,
        tokenSupply,
        chainTime: block.timestamp,
        fetchedAt: Date.now(),
        account: position,
      };
    },
  });
}

/** Chain time in seconds, ticking every second from the last snapshot. */
export function useChainNow(snapshot?: Pick<AuctionSnapshot, "chainTime" | "fetchedAt">): bigint | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!snapshot) return undefined;
  return snapshot.chainTime + BigInt(Math.floor((Date.now() - snapshot.fetchedAt) / 1000));
}

/** Every event the auction has emitted since deployment, oldest first. */
export function useAuctionEvents(deployment: Deployment) {
  const chainId = deployment.chainId as ChainId;
  const client = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["events", chainId, deployment.auction.address],
    enabled: Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client) throw new Error("No RPC client for this network");
      return client.getContractEvents({
        address: deployment.auction.address,
        abi: dutchAuctionAbi,
        fromBlock: BigInt(deployment.auction.blockNumber),
        strict: true,
      });
    },
  });
}

export type AuctionEvent = NonNullable<ReturnType<typeof useAuctionEvents>["data"]>[number];
