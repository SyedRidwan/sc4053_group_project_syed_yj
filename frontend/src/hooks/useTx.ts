import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash } from "viem";
import { usePublicClient } from "wagmi";
import type { ChainId } from "../wagmi";

export type TxStatus =
  | { state: "idle" }
  | { state: "pending"; label: string }
  | { state: "confirming"; label: string; hash: Hash }
  | { state: "success"; label: string; hash: Hash }
  | { state: "error"; label: string; message: string };

/** Turns wallet and contract errors into one readable line, preferring the revert reason. */
export function errorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in your wallet";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.reason) return reverted.reason;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sends a transaction, waits for it to be mined, refreshes every query, then reports success. Each card owns
 * one of these, so its status line only reports that card's transactions.
 */
export function useTx(chainId: number) {
  const client = usePublicClient({ chainId: chainId as ChainId });
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TxStatus>({ state: "idle" });

  async function run(label: string, send: () => Promise<Hash>): Promise<boolean> {
    try {
      setStatus({ state: "pending", label });
      const hash = await send();
      setStatus({ state: "confirming", label, hash });
      if (!client) throw new Error("No RPC client for this network");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      // Refresh before reporting success, so callers that reset a form on `true` do it in the same
      // render as the success line, not after input typed in the meantime
      await queryClient.invalidateQueries();
      setStatus({ state: "success", label, hash });
      return true;
    } catch (err) {
      setStatus({ state: "error", label, message: errorMessage(err) });
      return false;
    }
  }

  const busy = status.state === "pending" || status.state === "confirming";
  return { status, run, busy };
}
