import { useState } from "react";
import { useWatchAsset, useWriteContract } from "wagmi";
import { dutchAuctionAbi } from "../abi";
import type { ChainId } from "../wagmi";
import type { Listing } from "./useLaunches";
import { useTx } from "./useTx";

export type WalletAdd = "idle" | "asking" | "added" | "declined";

/**
 * Claims a listing's tokens, then asks the wallet to start showing them. A wallet always asks its owner to approve a new
 * token, and no site can skip that, so saying no leaves the tokens safely claimed and offers the button again.
 */
export function useClaim(listing: Listing) {
  const chainId = listing.chainId as ChainId;
  const { writeContractAsync } = useWriteContract();
  const { watchAssetAsync } = useWatchAsset();
  const tx = useTx(chainId);
  const [walletAdd, setWalletAdd] = useState<WalletAdd>("idle");

  async function addToWallet() {
    setWalletAdd("asking");
    try {
      const added = await watchAssetAsync({
        type: "ERC20",
        options: { address: listing.token, symbol: listing.symbol, decimals: 18 },
      });
      setWalletAdd(added ? "added" : "declined");
    } catch {
      setWalletAdd("declined");
    }
  }

  async function claim(label: string) {
    const claimed = await tx.run(label, () =>
      writeContractAsync({ address: listing.auction, abi: dutchAuctionAbi, functionName: "claim", chainId })
    );
    if (claimed) await addToWallet();
  }

  return { tx, walletAdd, claim, addToWallet };
}
