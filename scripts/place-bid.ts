import { network } from "hardhat";
import { formatEther, formatUnits, parseEther } from "viem";

const { viem } = await network.create({
  network: "sepolia",
});

// 방금 새로 배포된 DutchAuction 주소로 바꿀 것
const auctionAddress =
  "0x9240c584618248Ad615aBaa14d91C9B87fBd2BB6";

const [wallet] = await viem.getWalletClients();

const publicClient = await viem.getPublicClient();

const auction = await viem.getContractAt(
  "DutchAuction",
  auctionAddress
);

console.log("Bidder:", wallet.account.address);

const currentPrice =
  await auction.read.getCurrentPrice();

console.log(
  "Current price:",
  formatEther(currentPrice),
  "ETH per TIM"
);

// 0.01 Sepolia ETH로 bid
const bidAmount = parseEther("0.01");

console.log(
  "Sending bid:",
  formatEther(bidAmount),
  "ETH"
);

const hash = await auction.write.bid([], {
  account: wallet.account,
  value: bidAmount,
});

console.log("Transaction hash:", hash);

console.log("Waiting for confirmation...");

const receipt =
  await publicClient.waitForTransactionReceipt({
    hash,
  });

console.log(
  "Transaction status:",
  receipt.status
);

const bid = await auction.read.bids([
  wallet.account.address,
]);

console.log(
  "ETH committed:",
  formatEther(bid[0])
);

console.log(
  "TIM allocated:",
  formatUnits(bid[1], 18)
);

console.log(
  "Claimed:",
  bid[2]
);