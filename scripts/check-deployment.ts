import { network } from "hardhat";
import { formatEther, formatUnits } from "viem";

const { viem } = await network.create({
  network: "sepolia",
});

const tokenAddress =
  "0xb9FFAfBf4D90Ae76c5a30b28903A09F1A84E0A55";

const auctionAddress =
  "0xc5816C035AAD94d35A1EAf650AD1008214681ff6";

const token = await viem.getContractAt(
  "AuctionToken",
  tokenAddress
);

const auction = await viem.getContractAt(
  "DutchAuction",
  auctionAddress
);

const name = await token.read.name();
const symbol = await token.read.symbol();

const auctionTokenBalance =
  await token.read.balanceOf([auctionAddress]);

const currentPrice =
  await auction.read.getCurrentPrice();

const remainingTokens =
  await auction.read.getRemainingTokens();

console.log("Token name:", name);
console.log("Token symbol:", symbol);

console.log(
  "TIM held by auction:",
  formatUnits(auctionTokenBalance, 18)
);

console.log(
  "Current auction price:",
  formatEther(currentPrice),
  "ETH per TIM"
);

console.log(
  "Remaining TIM:",
  formatUnits(remainingTokens, 18)
);