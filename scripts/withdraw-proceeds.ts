import { network } from "hardhat";
import { formatEther } from "viem";

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

console.log("Seller wallet:", wallet.account.address);
console.log("Auction:", auctionAddress);

const seller = await auction.read.seller();

const proceedsBefore =
  await auction.read.sellerProceeds();

const walletBalanceBefore =
  await publicClient.getBalance({
    address: wallet.account.address,
  });

console.log(
  "Recorded seller:",
  seller
);

console.log(
  "Seller proceeds before withdrawal:",
  formatEther(proceedsBefore),
  "ETH"
);

console.log(
  "Seller wallet ETH before:",
  formatEther(walletBalanceBefore),
  "ETH"
);

if (
  seller.toLowerCase() !==
  wallet.account.address.toLowerCase()
) {
  console.log("");
  console.log(
    "This wallet is not the auction seller."
  );

  process.exit(0);
}

if (proceedsBefore === 0n) {
  console.log("");
  console.log(
    "No seller proceeds are currently available to withdraw."
  );

  process.exit(0);
}

console.log("");
console.log(
  "Withdrawing seller proceeds..."
);

const hash =
  await auction.write.withdrawProceeds([], {
    account: wallet.account,
  });

console.log(
  "Withdrawal transaction:",
  hash
);

console.log(
  "Waiting for confirmation..."
);

const receipt =
  await publicClient.waitForTransactionReceipt({
    hash,
  });

console.log(
  "Withdrawal status:",
  receipt.status
);

const proceedsAfter =
  await auction.read.sellerProceeds();

const walletBalanceAfter =
  await publicClient.getBalance({
    address: wallet.account.address,
  });

console.log("");

console.log(
  "Seller proceeds after withdrawal:",
  formatEther(proceedsAfter),
  "ETH"
);

console.log(
  "Seller wallet ETH after:",
  formatEther(walletBalanceAfter),
  "ETH"
);

console.log(
  "Wallet ETH change:",
  formatEther(
    walletBalanceAfter - walletBalanceBefore
  ),
  "ETH"
);

console.log("");

console.log(
  "Note: wallet ETH change = withdrawn proceeds - gas fee."
);