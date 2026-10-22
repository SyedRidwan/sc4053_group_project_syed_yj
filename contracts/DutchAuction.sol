// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Uniform clearing price Dutch auction for an ERC20 token launch
/// @notice Bidders commit ETH while the price falls linearly from `startPrice` to `reservePrice` over 20 minutes.
///         The auction clears as soon as the committed ETH buys the whole supply at the current price.
///         Every bidder pays the same clearing price, and unsold tokens are burned.
/// @dev Prices are in wei per whole token (1e18 token-wei). See spec.md for the rules and invariants.
contract DutchAuction is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DURATION = 20 minutes;
    uint256 public constant TOKEN_UNIT = 1e18;

    ERC20Burnable public immutable token;
    address public immutable seller;
    uint256 public immutable totalTokens;
    uint256 public immutable startPrice;
    uint256 public immutable reservePrice;

    uint256 public startTime;
    uint256 public endTime;
    uint256 public totalCommitted;
    uint256 public clearingPrice;
    uint256 public tokensSold;
    bool public finalized;
    bool public proceedsWithdrawn;

    mapping(address => uint256) public commitments;
    mapping(address => bool) public claimed;

    event AuctionStarted(uint256 startTime, uint256 endTime);
    event BidPlaced(address indexed bidder, uint256 ethAccepted, uint256 ethRefunded, uint256 priceAtBid);
    event AuctionFinalized(uint256 clearingPrice, uint256 tokensSold, uint256 tokensBurned);
    event TokensClaimed(address indexed bidder, uint256 amount);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    modifier onlySeller() {
        require(msg.sender == seller, "Only seller");
        _;
    }

    /// @param _token Burnable ERC20 being sold (18 decimals)
    /// @param _totalTokens Token-wei offered for sale
    /// @param _startPrice Opening price in wei per whole token
    /// @param _reservePrice Floor price in wei per whole token, reached at the end of the window
    constructor(address _token, uint256 _totalTokens, uint256 _startPrice, uint256 _reservePrice) {
        require(_token != address(0), "Invalid token address");
        require(_totalTokens > 0, "Invalid token supply");
        require(_startPrice > _reservePrice && _reservePrice > 0, "Invalid prices");

        token = ERC20Burnable(_token);
        seller = msg.sender;
        totalTokens = _totalTokens;
        startPrice = _startPrice;
        reservePrice = _reservePrice;
    }

    /// @notice Pulls the sale supply from the seller and starts the 20-minute clock.
    /// @dev The seller must approve `totalTokens` first, so the auction can never run unfunded.
    function start() external onlySeller {
        require(startTime == 0, "Already started");

        startTime = block.timestamp;
        endTime = block.timestamp + DURATION;
        emit AuctionStarted(startTime, endTime);

        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), totalTokens);
    }

    /// @notice Current price in wei per whole token, decaying linearly to `reservePrice`.
    function currentPrice() public view returns (uint256) {
        if (startTime == 0) {
            return startPrice;
        }
        if (block.timestamp >= endTime) {
            return reservePrice;
        }
        uint256 elapsed = block.timestamp - startTime;
        // Multiply before dividing so the decay has no truncation drift
        return startPrice - ((startPrice - reservePrice) * elapsed) / DURATION;
    }

    /// @notice True once the committed ETH buys the whole supply at the current price.
    function soldOut() public view returns (bool) {
        return startTime != 0 && totalCommitted >= (totalTokens * currentPrice()) / TOKEN_UNIT;
    }

    /// @notice True while bids are accepted.
    function isActive() public view returns (bool) {
        return startTime != 0 && block.timestamp < endTime && !finalized && !soldOut();
    }

    /// @notice Commits ETH to the auction. A bid that bridges the sell-out threshold is accepted
    ///         only up to the remaining room; its surplus is refunded in the same transaction.
    function bid() external payable nonReentrant {
        require(isActive(), "Auction not active");
        require(msg.value > 0, "Zero bid");

        uint256 price = currentPrice();
        uint256 room = (totalTokens * price) / TOKEN_UNIT - totalCommitted;
        uint256 accepted = msg.value < room ? msg.value : room;
        uint256 refund = msg.value - accepted;

        commitments[msg.sender] += accepted;
        totalCommitted += accepted;
        emit BidPlaced(msg.sender, accepted, refund, price);

        if (accepted == room) {
            _finalize();
        }

        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            require(ok, "Refund failed");
        }
    }

    /// @notice Settles the auction once it has sold out or the 20 minutes have elapsed. Callable by anyone.
    function finalize() external {
        require(!finalized, "Already finalized");
        require(_canFinalize(), "Auction still active");
        _finalize();
    }

    /// @notice Tokens owed to `bidder` at the clearing price (0 before finalization).
    function tokensOf(address bidder) public view returns (uint256) {
        if (!finalized || totalCommitted == 0) {
            return 0;
        }
        // Pro-rata share of tokensSold, so total claims can never exceed what the contract holds
        return (commitments[bidder] * tokensSold) / totalCommitted;
    }

    /// @notice Transfers the caller's tokens. Finalizes first if the auction is over but not yet settled.
    function claim() external nonReentrant {
        if (!finalized) {
            require(_canFinalize(), "Auction still active");
            _finalize();
        }
        require(!claimed[msg.sender], "Already claimed");

        uint256 amount = tokensOf(msg.sender);
        require(amount > 0, "Nothing to claim");

        claimed[msg.sender] = true;
        emit TokensClaimed(msg.sender, amount);

        IERC20(address(token)).safeTransfer(msg.sender, amount);
    }

    /// @notice Sends the seller exactly the ETH committed by bidders, once.
    function withdrawProceeds() external onlySeller nonReentrant {
        require(finalized, "Auction not finalized");
        require(!proceedsWithdrawn, "Already withdrawn");

        proceedsWithdrawn = true;
        uint256 amount = totalCommitted;
        emit ProceedsWithdrawn(seller, amount);

        (bool ok, ) = payable(seller).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    function _canFinalize() internal view returns (bool) {
        return startTime != 0 && (block.timestamp >= endTime || soldOut());
    }

    /// @dev Fixes the uniform clearing price and burns every token not sold at it.
    function _finalize() internal {
        finalized = true;

        uint256 impliedPrice = (totalCommitted * TOKEN_UNIT) / totalTokens;
        clearingPrice = impliedPrice > reservePrice ? impliedPrice : reservePrice;

        uint256 sold = (totalCommitted * TOKEN_UNIT) / clearingPrice;
        tokensSold = sold < totalTokens ? sold : totalTokens;
        uint256 unsold = totalTokens - tokensSold;
        emit AuctionFinalized(clearingPrice, tokensSold, unsold);

        if (unsold > 0) {
            token.burn(unsold);
        }
    }
}
