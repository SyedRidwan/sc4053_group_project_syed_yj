import { useWatchAsset } from "wagmi";
import { Card, ExplorerLink, Row, type AuctionView } from "./ui";

export function ContractsCard({ deployment, account }: AuctionView) {
  const { watchAsset } = useWatchAsset();

  return (
    <Card className="card-contracts" title="Contracts">
      <Row label="Auction">
        <ExplorerLink chainId={deployment.chainId} kind="address" value={deployment.auction.address} />
      </Row>
      <Row label="TIM token">
        <ExplorerLink chainId={deployment.chainId} kind="address" value={deployment.token.address} />
      </Row>
      <Row label="Seller">
        <ExplorerLink chainId={deployment.chainId} kind="address" value={deployment.deployer} />
      </Row>
      {account && (
        <button
          className="button button-ghost"
          type="button"
          onClick={() =>
            watchAsset({ type: "ERC20", options: { address: deployment.token.address, symbol: "TIM", decimals: 18 } })
          }
        >
          Add TIM to wallet
        </button>
      )}
    </Card>
  );
}
