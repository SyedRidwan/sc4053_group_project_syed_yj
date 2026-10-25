import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("HortonsAuctionModule", (m) => {
  const initialSupply = 1000n;

  const token = m.contract("AuctionToken", [
    initialSupply,
  ]);

  const startPrice =
    1_000_000_000_000_000_000n; // 1 ETH

  const reservePrice =
    200_000_000_000_000_000n;   // 0.2 ETH

  const tokensForSale =
    1000n * 10n ** 18n;

  const auction = m.contract("DutchAuction", [
    token,
    startPrice,
    reservePrice,
    tokensForSale,
  ]);

  m.call(
    token,
    "transfer",
    [
      auction,
      tokensForSale,
    ]
  );

  return {
    token,
    auction,
  };
});