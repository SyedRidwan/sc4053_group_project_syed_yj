// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DutchAuction {
    uint256 public constant DURATION = 20 minutes;
    uint256 public constant TOKEN_UNIT = 1e18;

    IERC20 public immutable token;
    address public immutable seller;
    uint256 public immutable totalTokensForSale;
    uint256 public immutable startPrice;
    uint256 public immutable reservePrice;
    uint256 public immutable discountRate;
    uint256 public immutable startTime;
    uint256 public immutable endTime;

    uint256 public totalTokensSold;
    uint256 public totalEthCommitted;
    uint256 public clearingPrice;
    bool public isFinalized;

    mapping(address => uint256) public committedETH;
    mapping(address => uint256) public allocatedTokens;
    mapping(address => bool) public hasClaimed;

    event BidSubmitted(
        address indexed bidder,
        uint256 ethCommitted,
        uint256 tokensAllocated,
        uint256 priceAtBid,
        bool bridgedThreshold
    );
    event AuctionFinalized(
        uint256 finalClearingPrice,
        uint256 totalTokensSold,
        uint256 unsoldTokensBurned,
        uint256 timestamp
    );
    event TokensAndRefundClaimed(
        address indexed bidder,
        uint256 tokensClaimed,
        uint256 ethRefunded
    );

    constructor(
        address _token,
        uint256 _totalTokensForSale,
        uint256 _startPrice,
        uint256 _reservePrice
    ) {
        require(_token != address(0), "Invalid token address");
        require(_totalTokensForSale > 0, "Invalid token supply");
        require(_startPrice > _reservePrice && _reservePrice > 0, "Invalid prices");

        token = IERC20(_token);
        seller = msg.sender;
        totalTokensForSale = _totalTokensForSale;
        startPrice = _startPrice;
        reservePrice = _reservePrice;

        startTime = block.timestamp;
        endTime = block.timestamp + DURATION;
        discountRate = (_startPrice - _reservePrice) / DURATION;
    }

    function getCurrentPrice() public view returns (uint256) {
        if (clearingPrice > 0) {
            return clearingPrice;
        }
        if (block.timestamp <= startTime) {
            return startPrice;
        }
        if (block.timestamp >= endTime) {
            return reservePrice;
        }
        uint256 elapsed = block.timestamp - startTime;
        return startPrice - (discountRate * elapsed);
    }

    function isAuctionActive() public view returns (bool) {
        return (
            !isFinalized &&
            block.timestamp >= startTime &&
            block.timestamp < endTime &&
            totalTokensSold < totalTokensForSale
        );
    }

    function bid() external payable {
        require(isAuctionActive(), "Auction not active");

        uint256 currentPrice = getCurrentPrice();
        uint256 requestedTokens = (msg.value * TOKEN_UNIT) / currentPrice;
        require(requestedTokens > 0, "Bid too small");

        uint256 remainingTokens = totalTokensForSale - totalTokensSold;
        uint256 tokensToAllocate = requestedTokens;
        bool bridged = false;

        if (requestedTokens >= remainingTokens) {
            tokensToAllocate = remainingTokens;
            bridged = true;
            clearingPrice = currentPrice;
            isFinalized = true;

            uint256 usedEth = (tokensToAllocate * currentPrice) / TOKEN_UNIT;
            uint256 excessEth = msg.value - usedEth;
            if (excessEth > 0) {
                (bool refunded, ) = payable(msg.sender).call{value: excessEth}("");
                require(refunded, "Excess refund failed");
            }
        }

        totalTokensSold += tokensToAllocate;
        totalEthCommitted += msg.value;
        committedETH[msg.sender] += msg.value;
        allocatedTokens[msg.sender] += tokensToAllocate;

        emit BidSubmitted(msg.sender, msg.value, tokensToAllocate, currentPrice, bridged);
    }

    function finalizeAuction() public {
        require(!isFinalized, "Already finalized");
        require(block.timestamp >= endTime || totalTokensSold == totalTokensForSale, "Auction active");

        isFinalized = true;
        if (clearingPrice == 0) {
            clearingPrice = reservePrice;
        }

        uint256 unsoldTokens = totalTokensForSale - totalTokensSold;
        if (unsoldTokens > 0) {
            token.transfer(address(0), unsoldTokens);
        }

        emit AuctionFinalized(clearingPrice, totalTokensSold, unsoldTokens, block.timestamp);
    }

    function claimTokensAndRefund() external {
        if (!isFinalized) {
            require(block.timestamp >= endTime, "Auction not ended");
            finalizeAuction();
        }
        require(!hasClaimed[msg.sender], "Already claimed");

        uint256 userTokens = allocatedTokens[msg.sender];
        uint256 userEth = committedETH[msg.sender];
        require(userTokens > 0, "Nothing to claim");

        uint256 actualCost = (userTokens * clearingPrice) / TOKEN_UNIT;
        uint256 refundAmount = userEth - actualCost;

        require(token.transfer(msg.sender, userTokens), "Token transfer failed");

        if (refundAmount > 0) {
            (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
            require(success, "ETH transfer failed");
        }

        hasClaimed[msg.sender] = true;
        emit TokensAndRefundClaimed(msg.sender, userTokens, refundAmount);
    }

    function withdrawSellerProceeds() external {
        require(msg.sender == seller, "Unauthorized");
        require(isFinalized, "Auction not finalized");

        (bool success, ) = payable(seller).call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }
}