import { network } from "hardhat";
import { formatEther, formatUnits } from "viem";

const { viem } = await network.create({
  network: "sepolia",
});

const auctionAddress =
  "0x9240c584618248Ad615aBaa14d91C9B87fBd2BB6";

const [wallet] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const auction = await viem.getContractAt(
  "DutchAuction",
  auctionAddress
);

const tokenAddress = await auction.read.token();

const token = await viem.getContractAt(
  "AuctionToken",
  tokenAddress
);

console.log("Wallet:", wallet.account.address);
console.log("Auction:", auctionAddress);
console.log("Token:", tokenAddress);

// --------------------------------------------------
// 1. 현재 시간과 auction 종료 시간 확인
// --------------------------------------------------

const endTime = await auction.read.endTime();

const latestBlock = await publicClient.getBlock();

const now = latestBlock.timestamp;

console.log(
  "Current block timestamp:",
  now.toString()
);

console.log(
  "Auction end timestamp:",
  endTime.toString()
);

if (now < endTime) {
  const secondsLeft = endTime - now;

  console.log("");
  console.log("Auction is still active.");
  console.log(
    "Seconds remaining:",
    secondsLeft.toString()
  );

  process.exit(0);
}

// --------------------------------------------------
// 2. Auction finalize
// --------------------------------------------------

let finalized =
  await auction.read.finalized();

if (!finalized) {
  console.log("");
  console.log(
    "Auction has ended. Finalizing..."
  );

  const finalizeHash =
    await auction.write.finalizeAuction([], {
      account: wallet.account,
    });

  console.log(
    "Finalize transaction:",
    finalizeHash
  );

  console.log(
    "Waiting for finalize confirmation..."
  );

  const finalizeReceipt =
    await publicClient.waitForTransactionReceipt({
      hash: finalizeHash,
    });

  console.log(
    "Finalize status:",
    finalizeReceipt.status
  );

  finalized =
    await auction.read.finalized();
} else {
  console.log("");
  console.log(
    "Auction was already finalized."
  );
}

// --------------------------------------------------
// 3. Clearing price 확인
// --------------------------------------------------

const clearingPrice =
  await auction.read.clearingPrice();

console.log("");
console.log(
  "Clearing price:",
  formatEther(clearingPrice),
  "ETH per TIM"
);

// --------------------------------------------------
// 4. 내 bid 정보 확인
// --------------------------------------------------

const bid = await auction.read.bids([
  wallet.account.address,
]);

const ethCommitted = bid[0];
const timAllocated = bid[1];
const alreadyClaimed = bid[2];

console.log("");
console.log(
  "ETH committed:",
  formatEther(ethCommitted)
);

console.log(
  "TIM allocated:",
  formatUnits(timAllocated, 18)
);

console.log(
  "Already claimed:",
  alreadyClaimed
);

// --------------------------------------------------
// 5. Refund 계산 확인
// --------------------------------------------------

const refund =
  await auction.read.getRefund([
    wallet.account.address,
  ]);

console.log(
  "Refund owed:",
  formatEther(refund),
  "ETH"
);

// --------------------------------------------------
// 6. Claim 전 wallet balance 저장
// --------------------------------------------------

const timBefore =
  await token.read.balanceOf([
    wallet.account.address,
  ]);

const ethBefore =
  await publicClient.getBalance({
    address: wallet.account.address,
  });

console.log("");
console.log(
  "TIM balance before claim:",
  formatUnits(timBefore, 18)
);

console.log(
  "ETH balance before claim:",
  formatEther(ethBefore)
);

// --------------------------------------------------
// 7. Claim 실행
// --------------------------------------------------

if (!alreadyClaimed && timAllocated > 0n) {
  console.log("");
  console.log(
    "Claiming TIM + refund..."
  );

  const claimHash =
    await auction.write.claim([], {
      account: wallet.account,
    });

  console.log(
    "Claim transaction:",
    claimHash
  );

  console.log(
    "Waiting for claim confirmation..."
  );

  const claimReceipt =
    await publicClient.waitForTransactionReceipt({
      hash: claimHash,
    });

  console.log(
    "Claim status:",
    claimReceipt.status
  );

  // ------------------------------------------------
  // 8. Claim 후 balance 확인
  // ------------------------------------------------

  const timAfter =
    await token.read.balanceOf([
      wallet.account.address,
    ]);

  const ethAfter =
    await publicClient.getBalance({
      address: wallet.account.address,
    });

  console.log("");
  console.log(
    "TIM balance after claim:",
    formatUnits(timAfter, 18)
  );

  console.log(
    "TIM received:",
    formatUnits(
      timAfter - timBefore,
      18
    )
  );

  console.log(
    "ETH balance after claim:",
    formatEther(ethAfter)
  );

  console.log("");
  console.log(
    "Note: ETH balance change = refund - gas fees."
  );
} else if (alreadyClaimed) {
  console.log("");
  console.log(
    "This bid has already been claimed."
  );
} else {
  console.log("");
  console.log(
    "No TIM allocation exists for this wallet."
  );
}