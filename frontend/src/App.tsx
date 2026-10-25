import { useEffect, useState } from "react";

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  parseEther,
} from "viem";

import { sepolia } from "viem/chains";

import {
  AUCTION_ADDRESS,
  AUCTION_ABI,
} from "./contracts";

function App() {
  const [account, setAccount] =
    useState<`0x${string}` | null>(null);

  const [currentPrice, setCurrentPrice] =
    useState<string>("-");

  const [remainingTokens, setRemainingTokens] =
    useState<string>("-");

  const [finalized, setFinalized] =
    useState<boolean | null>(null);

  const [clearingPrice, setClearingPrice] =
    useState<string>("-");

  const [ethCommitted, setEthCommitted] =
    useState<string>("-");

  const [tokenAllocated, setTokenAllocated] =
    useState<string>("-");

  const [claimed, setClaimed] =
    useState<boolean | null>(null);

  const [refund, setRefund] =
    useState<string>("-");

  const [seller, setSeller] =
    useState<`0x${string}` | null>(null);

  const [sellerProceeds, setSellerProceeds] =
    useState<string>("-");

  const [bidAmount, setBidAmount] =
    useState<string>("0.01");

  const [txStatus, setTxStatus] =
    useState<string>("");

  const [error, setError] =
    useState<string | null>(null);

  const [endTime, setEndTime] =
    useState<bigint | null>(null);

  const [secondsRemaining, setSecondsRemaining] =
    useState<number>(0);

  const [isFinalizing, setIsFinalizing] =
    useState<boolean>(false);

  const [isClaiming, setIsClaiming] =
    useState<boolean>(false);

  const [isWithdrawing, setIsWithdrawing] =
    useState<boolean>(false);

  const isSeller =
    account &&
    seller &&
    account.toLowerCase() === seller.toLowerCase();

  async function connectWallet() {
    try {
      setError(null);

      if (!window.ethereum) {
        setError("MetaMask is not installed.");
        return;
      }

      const walletClient =
        createWalletClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      const [address] =
        await walletClient.requestAddresses();

      setAccount(address);

      const chainId =
        await walletClient.getChainId();

      if (chainId !== sepolia.id) {
        try {
          await walletClient.switchChain({
            id: sepolia.id,
          });
        } catch {
          setError(
            "Please switch MetaMask to Ethereum Sepolia."
          );
          return;
        }
      }

      await loadAuctionData(address);
    } catch (err) {
      console.error(err);

      setError(
        "Failed to connect wallet or read auction."
      );
    }
  }

  async function loadAuctionData(
    address: `0x${string}`
  ) {
    if (!window.ethereum) {
      return;
    }

    const publicClient =
      createPublicClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      });

    const price =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "getCurrentPrice",
      });

    const remaining =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "getRemainingTokens",
      });

    const isFinalized =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "finalized",
      });

    const auctionEndTime =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "endTime",
      });

    const finalPrice =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "clearingPrice",
      });

    const sellerAddress =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "seller",
      });

    const proceeds =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "sellerProceeds",
      });

    const bid =
      await publicClient.readContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: "bids",
        args: [address],
      });

    setCurrentPrice(
      formatEther(price)
    );

    setRemainingTokens(
      formatUnits(remaining, 18)
    );

    setFinalized(isFinalized);

    setEndTime(auctionEndTime);

    setClearingPrice(
      formatEther(finalPrice)
    );

    setSeller(sellerAddress);

    setSellerProceeds(
      formatEther(proceeds)
    );

    setEthCommitted(
      formatEther(bid[0])
    );

    setTokenAllocated(
      formatUnits(bid[1], 18)
    );

    setClaimed(bid[2]);

    if (isFinalized && bid[0] > 0n) {
      const refundAmount =
        await publicClient.readContract({
          address: AUCTION_ADDRESS,
          abi: AUCTION_ABI,
          functionName: "getRefund",
          args: [address],
        });

      setRefund(
        formatEther(refundAmount)
      );
    } else {
      setRefund("-");
    }
  }

  async function refreshData() {
    if (!account) {
      return;
    }

    try {
      setError(null);

      await loadAuctionData(account);
    } catch (err) {
      console.error(err);

      setError(
        "Failed to refresh auction data."
      );
    }
  }

  useEffect(() => {
    if (!endTime || !window.ethereum) {
      return;
    }

    const updateCountdown = async () => {
      try {
        const publicClient =
          createPublicClient({
            chain: sepolia,
            transport: custom(window.ethereum),
          });

        const latestBlock =
          await publicClient.getBlock();

        const blockchainNow =
          latestBlock.timestamp;

        const remaining =
          endTime - blockchainNow;

        setSecondsRemaining(
          remaining > 0n
            ? Number(remaining)
            : 0
        );
      } catch (err) {
        console.error(
          "Failed to update countdown:",
          err
        );
      }
    };

    updateCountdown();

    const interval =
      setInterval(
        updateCountdown,
        5000
      );

    return () =>
      clearInterval(interval);
  }, [endTime]);

  function formatTime(seconds: number) {
    const minutes =
      Math.floor(seconds / 60);

    const secs =
      seconds % 60;

    return `${minutes}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  async function placeBid() {
    try {
      setError(null);
      setTxStatus("");

      if (!window.ethereum) {
        setError("MetaMask is not installed.");
        return;
      }

      if (!account) {
        setError(
          "Please connect your wallet first."
        );
        return;
      }

      if (finalized) {
        setError(
          "This auction has already been finalized."
        );
        return;
      }

      if (
        !bidAmount ||
        Number(bidAmount) <= 0
      ) {
        setError(
          "Enter a valid ETH amount."
        );
        return;
      }

      const walletClient =
        createWalletClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      const publicClient =
        createPublicClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      setTxStatus(
        "Waiting for MetaMask confirmation..."
      );

      const hash =
        await walletClient.writeContract({
          address: AUCTION_ADDRESS,
          abi: AUCTION_ABI,
          functionName: "bid",
          account,
          value: parseEther(bidAmount),
        });

      setTxStatus(
        `Transaction submitted: ${hash}`
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      if (receipt.status === "success") {
        setTxStatus(
          "Bid confirmed successfully."
        );

        await loadAuctionData(account);
      } else {
        setTxStatus(
          "Transaction failed."
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "Bid transaction failed or was rejected."
      );

      setTxStatus("");
    }
  }

  async function finalizeAuction() {
    try {
      setError(null);
      setTxStatus("");

      if (!window.ethereum) {
        setError("MetaMask is not installed.");
        return;
      }

      if (!account) {
        setError(
          "Please connect your wallet first."
        );
        return;
      }

      if (finalized) {
        setError(
          "Auction is already finalized."
        );
        return;
      }

      if (secondsRemaining > 0) {
        setError(
          "Auction is still active."
        );
        return;
      }

      const walletClient =
        createWalletClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      const publicClient =
        createPublicClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      setIsFinalizing(true);

      setTxStatus(
        "Waiting for MetaMask confirmation..."
      );

      const hash =
        await walletClient.writeContract({
          address: AUCTION_ADDRESS,
          abi: AUCTION_ABI,
          functionName: "finalizeAuction",
          account,
        });

      setTxStatus(
        `Finalize transaction submitted: ${hash}`
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      if (receipt.status === "success") {
        setTxStatus(
          "Auction finalized successfully."
        );

        await loadAuctionData(account);
      } else {
        setTxStatus(
          "Finalize transaction failed."
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "Finalize transaction failed or was rejected."
      );
    } finally {
      setIsFinalizing(false);
    }
  }

  async function claimTokens() {
    try {
      setError(null);
      setTxStatus("");

      if (!window.ethereum) {
        setError("MetaMask is not installed.");
        return;
      }

      if (!account) {
        setError(
          "Please connect your wallet first."
        );
        return;
      }

      if (!finalized) {
        setError(
          "Auction must be finalized first."
        );
        return;
      }

      if (claimed) {
        setError(
          "You have already claimed."
        );
        return;
      }

      if (
        tokenAllocated === "-" ||
        Number(tokenAllocated) <= 0
      ) {
        setError(
          "You have no TIM allocation to claim."
        );
        return;
      }

      const walletClient =
        createWalletClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      const publicClient =
        createPublicClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      setIsClaiming(true);

      setTxStatus(
        "Waiting for MetaMask confirmation..."
      );

      const hash =
        await walletClient.writeContract({
          address: AUCTION_ADDRESS,
          abi: AUCTION_ABI,
          functionName: "claim",
          account,
        });

      setTxStatus(
        `Claim transaction submitted: ${hash}`
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      if (receipt.status === "success") {
        setTxStatus(
          "TIM + refund claimed successfully."
        );

        await loadAuctionData(account);
      } else {
        setTxStatus(
          "Claim transaction failed."
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "Claim transaction failed or was rejected."
      );
    } finally {
      setIsClaiming(false);
    }
  }

  async function withdrawSellerProceeds() {
    try {
      setError(null);
      setTxStatus("");

      if (!window.ethereum) {
        setError("MetaMask is not installed.");
        return;
      }

      if (!account) {
        setError(
          "Please connect your wallet first."
        );
        return;
      }

      if (!isSeller) {
        setError(
          "Only the auction seller can withdraw proceeds."
        );
        return;
      }

      if (Number(sellerProceeds) <= 0) {
        setError(
          "There are no seller proceeds to withdraw."
        );
        return;
      }

      const walletClient =
        createWalletClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      const publicClient =
        createPublicClient({
          chain: sepolia,
          transport: custom(window.ethereum),
        });

      setIsWithdrawing(true);

      setTxStatus(
        "Waiting for MetaMask confirmation..."
      );

      const hash =
        await walletClient.writeContract({
          address: AUCTION_ADDRESS,
          abi: AUCTION_ABI,
          functionName: "withdrawProceeds",
          account,
        });

      setTxStatus(
        `Withdrawal transaction submitted: ${hash}`
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      if (receipt.status === "success") {
        setTxStatus(
          "Seller proceeds withdrawn successfully."
        );

        await loadAuctionData(account);
      } else {
        setTxStatus(
          "Withdrawal transaction failed."
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "Withdrawal transaction failed or was rejected."
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "750px",
        margin: "60px auto",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>
        Hortons Token Launch
      </h1>

      <p>
        Uniform Clearing Price Dutch Auction
      </p>

      <hr />

      {!account ? (
        <button
          onClick={connectWallet}
          style={{
            padding: "12px 20px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          Connect MetaMask
        </button>
      ) : (
        <>
          <h2>Wallet</h2>

          <p>
            <strong>
              Network:
            </strong>{" "}
            Ethereum Sepolia
          </p>

          <p>
            <strong>
              Address:
            </strong>{" "}
            {account}
          </p>

          <button
            onClick={refreshData}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Refresh Auction Data
          </button>

          <hr />

          <h2>Auction</h2>

          <p>
            <strong>
              Status:
            </strong>{" "}
            {finalized === null
              ? "-"
              : finalized
              ? "Finalized"
              : "Active"}
          </p>

          <p>
            <strong>
              Time Remaining:
            </strong>{" "}
            {finalized
              ? "Auction Ended"
              : formatTime(
                  secondsRemaining
                )}
          </p>

          <p>
            <strong>
              Current Price:
            </strong>{" "}
            {currentPrice} ETH / TIM
          </p>

          <p>
            <strong>
              Remaining TIM:
            </strong>{" "}
            {remainingTokens}
          </p>

          <p>
            <strong>
              Clearing Price:
            </strong>{" "}
            {clearingPrice} ETH / TIM
          </p>

          <button
            onClick={finalizeAuction}
            disabled={
              finalized === true ||
              secondsRemaining > 0 ||
              isFinalizing
            }
            style={{
              padding: "10px 18px",
              cursor:
                finalized === true ||
                secondsRemaining > 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isFinalizing
              ? "Finalizing..."
              : "Finalize Auction"}
          </button>

          <hr />

          <h2>Place Bid</h2>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <input
              type="number"
              step="0.001"
              min="0"
              value={bidAmount}
              onChange={(e) =>
                setBidAmount(
                  e.target.value
                )
              }
              disabled={
                finalized === true
              }
              style={{
                padding: "10px",
                fontSize: "16px",
                width: "160px",
              }}
            />

            <span>ETH</span>

            <button
              onClick={placeBid}
              disabled={
                finalized === true
              }
              style={{
                padding: "10px 18px",
                cursor:
                  finalized === true
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Place Bid
            </button>
          </div>

          {finalized && (
            <p>
              This auction has already ended.
            </p>
          )}

          <hr />

          <h2>Your Position</h2>

          <p>
            <strong>
              ETH Committed:
            </strong>{" "}
            {ethCommitted} ETH
          </p>

          <p>
            <strong>
              TIM Allocated:
            </strong>{" "}
            {tokenAllocated} TIM
          </p>

          <p>
            <strong>
              Refund:
            </strong>{" "}
            {refund} ETH
          </p>

          <p>
            <strong>
              Claimed:
            </strong>{" "}
            {claimed === null
              ? "-"
              : claimed
              ? "Yes"
              : "No"}
          </p>

          <button
            onClick={claimTokens}
            disabled={
              finalized !== true ||
              claimed === true ||
              tokenAllocated === "-" ||
              Number(tokenAllocated) <= 0 ||
              isClaiming
            }
            style={{
              padding: "10px 18px",
              marginTop: "10px",
              cursor:
                finalized !== true ||
                claimed === true ||
                tokenAllocated === "-" ||
                Number(tokenAllocated) <= 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isClaiming
              ? "Claiming..."
              : "Claim TIM + Refund"}
          </button>

          {isSeller && (
            <>
              <hr />

              <h2>Seller Controls</h2>

              <p>
                <strong>
                  Seller:
                </strong>{" "}
                {seller}
              </p>

              <p>
                <strong>
                  Seller Proceeds:
                </strong>{" "}
                {sellerProceeds} ETH
              </p>

              <button
                onClick={
                  withdrawSellerProceeds
                }
                disabled={
                  Number(
                    sellerProceeds
                  ) <= 0 ||
                  isWithdrawing
                }
                style={{
                  padding:
                    "10px 18px",
                  cursor:
                    Number(
                      sellerProceeds
                    ) <= 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {isWithdrawing
                  ? "Withdrawing..."
                  : "Withdraw Seller Proceeds"}
              </button>
            </>
          )}

          {txStatus && (
            <>
              <hr />

              <p>
                <strong>
                  Transaction:
                </strong>{" "}
                {txStatus}
              </p>
            </>
          )}
        </>
      )}

      {error && (
        <p
          style={{
            color: "red",
            marginTop: "20px",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default App;