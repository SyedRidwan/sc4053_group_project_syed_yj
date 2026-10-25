// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract DutchAuction is ReentrancyGuard {

    IERC20 public immutable token;

    uint256 public constant DURATION = 20 minutes;
    uint256 public constant TOKEN_SCALE = 1e18;

    uint256 public immutable startTime;
    uint256 public immutable endTime;

    uint256 public immutable startPrice;
    uint256 public immutable reservePrice;

    uint256 public immutable totalTokensForSale;

    uint256 public totalTokensAllocated;
    uint256 public totalEthCommitted;

    uint256 public clearingPrice;

    address public immutable seller;

    uint256 public sellerProceeds;

    bool public soldOut;
    bool public finalized;

    struct Bid {
        uint256 ethCommitted;
        uint256 tokenAmount;
        bool claimed;
    }

    mapping(address => Bid) public bids;

    event BidPlaced(
        address indexed bidder,
        uint256 ethCommitted,
        uint256 tokenAmount,
        uint256 price
    );

    event Claimed(
        address indexed bidder,
        uint256 tokenAmount,
        uint256 finalCost,
        uint256 refund
    );

    event ProceedsWithdrawn(

    address indexed seller,

    uint256 amount

    );

    constructor(
        address _token,
        uint256 _startPrice,
        uint256 _reservePrice,
        uint256 _totalTokensForSale
    ) {
        seller = msg.sender;
        require(
            _token != address(0),
            "Invalid token address"
        );

        require(
            _startPrice > _reservePrice,
            "Start price must exceed reserve price"
        );

        require(
            _totalTokensForSale > 0,
            "Token amount must be greater than zero"
        );

        token = IERC20(_token);

        startPrice = _startPrice;
        reservePrice = _reservePrice;

        totalTokensForSale = _totalTokensForSale;

        startTime = block.timestamp;
        endTime = block.timestamp + DURATION;
    }

    // ============================================================
    // PRICE
    // ============================================================

    function getCurrentPrice()
        public
        view
        returns (uint256)
    {
        if (block.timestamp >= endTime) {
            return reservePrice;
        }

        uint256 elapsed =
            block.timestamp - startTime;

        uint256 priceRange =
            startPrice - reservePrice;

        uint256 discount =
            (priceRange * elapsed) / DURATION;

        return startPrice - discount;
    }

    // ============================================================
    // REMAINING TOKENS
    // ============================================================

    function getRemainingTokens()
        public
        view
        returns (uint256)
    {
        return totalTokensForSale - totalTokensAllocated;
    }

    // ============================================================
    // BID
    // ============================================================

    function bid()
        external
        payable
    {
        require(
            block.timestamp < endTime,
            "Auction has ended"
        );

        require(
            !finalized,
            "Auction finalized"
        );

        require(
            !soldOut,
            "Auction sold out"
        );

        require(
            msg.value > 0,
            "Must send ETH"
        );

        uint256 currentPrice =
            getCurrentPrice();

        uint256 requestedTokens =
            (msg.value * TOKEN_SCALE) / currentPrice;

        require(
            requestedTokens > 0,
            "Bid too small"
        );

        uint256 remainingTokens =
            totalTokensForSale - totalTokensAllocated;

        uint256 allocatedTokens;

        if (requestedTokens > remainingTokens) {
            allocatedTokens = remainingTokens;
        } else {
            allocatedTokens = requestedTokens;
        }

        bids[msg.sender].ethCommitted += msg.value;
        bids[msg.sender].tokenAmount += allocatedTokens;

        totalEthCommitted += msg.value;
        totalTokensAllocated += allocatedTokens;

        // If this bid consumes the final available token,
        // the auction ends immediately.
        if (totalTokensAllocated == totalTokensForSale) {
            soldOut = true;
            finalized = true;
            clearingPrice = currentPrice;
        }

        emit BidPlaced(
            msg.sender,
            msg.value,
            allocatedTokens,
            currentPrice
        );
    }

    function finalizeAuction()
    external
    {
        require(
            !finalized,
            "Auction already finalized"
        );

        require(
            block.timestamp >= endTime,
            "Auction still active"
        );

        // Auction expired without selling out.
        clearingPrice = reservePrice;
        finalized = true;

        uint256 unsoldTokens =
            totalTokensForSale -
            totalTokensAllocated;

        if (unsoldTokens > 0) {
            ERC20Burnable(address(token))
                .burn(unsoldTokens);
        }
    }

    // ============================================================
    // REFUND CALCULATION
    // ============================================================

    function getRefund(
        address bidder
    )
        public
        view
        returns (uint256)
    {
        require(
            finalized,
            "Clearing price not finalized"
        );

        Bid memory userBid =
            bids[bidder];

        uint256 finalCost =
            (
                userBid.tokenAmount *
                clearingPrice
            ) / TOKEN_SCALE;

        return
            userBid.ethCommitted -
            finalCost;
    }

    // ============================================================
    // CLAIM
    // ============================================================

    function claim()
        external
        nonReentrant
    {
        require(
            finalized,
            "Auction not finalized"
        );

        Bid storage userBid =
            bids[msg.sender];

        require(
            userBid.tokenAmount > 0,
            "No tokens to claim"
        );

        require(
            !userBid.claimed,
            "Already claimed"
        );

        uint256 finalCost =
            (
                userBid.tokenAmount *
                clearingPrice
            ) / TOKEN_SCALE;

        uint256 refund =
            userBid.ethCommitted -
            finalCost;

        uint256 tokenAmount =
            userBid.tokenAmount;
    

        // -----------------------------------------
        // Effects BEFORE external interactions
        // -----------------------------------------

        userBid.claimed = true;
        sellerProceeds += finalCost;

        // -----------------------------------------
        // Transfer TIM
        // -----------------------------------------

        bool tokenSuccess =
            token.transfer(
                msg.sender,
                tokenAmount
            );

        require(
            tokenSuccess,
            "Token transfer failed"
        );

        // -----------------------------------------
        // Refund excess ETH
        // -----------------------------------------

        if (refund > 0) {

            (bool refundSuccess, ) =
                payable(msg.sender).call{
                    value: refund
                }("");

            require(
                refundSuccess,
                "ETH refund failed"
            );
        }

        emit Claimed(
            msg.sender,
            tokenAmount,
            finalCost,
            refund
        );
    }
    
    function withdrawProceeds()
        external
        nonReentrant
    {
        require(
            msg.sender == seller,
            "Only seller"
        );

        uint256 amount =
            sellerProceeds;

        require(
            amount > 0,
            "No proceeds available"
        );

        // Effects first
        sellerProceeds = 0;

        // Interaction last
        (bool success, ) =
            payable(seller).call{
                value: amount
            }("");

        require(
            success,
            "ETH transfer failed"
        );

        emit ProceedsWithdrawn(
            seller,
            amount
        );
    }
}