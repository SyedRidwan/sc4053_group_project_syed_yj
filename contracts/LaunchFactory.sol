// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DutchAuction.sol";
import "./HortonsToken.sol";

/// @title Launchpad factory for uniform clearing price Dutch auctions
/// @notice Anyone can launch a new ERC20 here in one transaction. Each launch gets its own token and its own
///         DutchAuction, which starts its fixed 20-minute window immediately. Sellers choose the supply and the
///         prices, within bounds, and never the duration or the shape of the price curve.
/// @dev DutchAuction fixes `seller = msg.sender`, so this factory is the on-chain seller of every auction. It uses that
///      power in exactly two places: `start()` inside `createLaunch`, and `withdrawProceeds()` for the registered seller.
///      Only factory-made tokens are accepted, because a fee-on-transfer or non-burnable token breaks claims and burning.
contract LaunchFactory is ReentrancyGuard {
    struct Launch {
        address token;
        address auction;
        address seller;
        uint256 createdBlock;
        bool hidden;
        bool verified;
    }

    /// @notice One row of the market page.
    struct LaunchView {
        uint256 id;
        address token;
        address auction;
        address seller;
        uint256 createdBlock;
        bool hidden;
        bool verified;
        string name;
        string symbol;
        uint256 supply;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 currentPrice;
        uint256 totalCommitted;
        uint256 clearingPrice;
        uint256 startTime;
        uint256 endTime;
        bool finalized;
        bool proceedsWithdrawn;
    }

    /// @notice One account's stake in one launch, for the portfolio page.
    struct PositionView {
        uint256 id;
        uint256 commitment;
        uint256 tokensOwed;
        bool claimed;
        uint256 tokenBalance;
    }

    uint256 public constant MIN_SUPPLY = 1e18; // 1 whole token
    uint256 public constant MAX_SUPPLY = 1e33; // 1e15 whole tokens
    uint256 public constant MIN_RESERVE = 1 gwei; // below this, rounding distorts the reported clearing price
    uint256 public constant MAX_PRICE = 1000 ether;
    uint256 public constant MIN_PRICE_RATIO = 2; // the price must really descend, so start >= 2 x reserve
    uint256 public constant MIN_RAISE = 0.001 ether; // ETH to buy the supply at reserve; stops instant dust sell-outs
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_SYMBOL_BYTES = 11;
    uint256 public constant MAX_PAGE = 50;

    /// @notice May hide or verify a listing. Has no route to funds, prices or running auctions.
    address public immutable curator;

    Launch[] private _launches;
    mapping(address => bool) private _isAuction;

    event LaunchCreated(uint256 indexed id, address indexed seller, address token, address auction);
    event LaunchHidden(uint256 indexed id, bool hidden);
    event LaunchVerified(uint256 indexed id, bool verified);
    event ProceedsForwarded(uint256 indexed id, address indexed seller, uint256 amount);

    modifier onlyCurator() {
        require(msg.sender == curator, "Only curator");
        _;
    }

    /// @param _curator Address allowed to hide and verify listings
    constructor(address _curator) {
        require(_curator != address(0), "Invalid curator");
        curator = _curator;
    }

    /// @notice Creates a token and its auction, moves the whole supply into the auction, and starts the 20-minute clock.
    /// @param name Token name, 1 to 32 bytes
    /// @param symbol Token symbol, 1 to 11 bytes
    /// @param supply Token-wei minted and offered for sale
    /// @param startPrice Opening price in wei per whole token
    /// @param reservePrice Floor price in wei per whole token
    /// @return id The new listing's id
    function createLaunch(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        uint256 startPrice,
        uint256 reservePrice
    ) external returns (uint256 id) {
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_BYTES, "Invalid name");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= MAX_SYMBOL_BYTES, "Invalid symbol");
        require(supply >= MIN_SUPPLY && supply <= MAX_SUPPLY, "Supply out of range");
        require(reservePrice >= MIN_RESERVE, "Reserve too low");
        require(startPrice <= MAX_PRICE, "Price too high");
        require(startPrice >= reservePrice * MIN_PRICE_RATIO, "Start must be at least 2x reserve");
        require((supply * reservePrice) / 1e18 >= MIN_RAISE, "Raise too small");

        HortonsToken token = new HortonsToken(name, symbol, supply);
        DutchAuction auction = new DutchAuction(address(token), supply, startPrice, reservePrice);

        id = _launches.length;
        _launches.push(Launch(address(token), address(auction), msg.sender, block.number, false, false));
        _isAuction[address(auction)] = true;
        emit LaunchCreated(id, msg.sender, address(token), address(auction));

        token.approve(address(auction), supply);
        auction.start();
    }

    /// @notice Forwards an auction's proceeds to its registered seller. Pays the tracked amount, never a balance.
    function withdrawProceeds(uint256 id) external nonReentrant {
        Launch storage launch = _launches[id];
        require(msg.sender == launch.seller, "Only launch seller");

        DutchAuction auction = DutchAuction(launch.auction);
        uint256 amount = auction.totalCommitted();
        auction.withdrawProceeds();
        emit ProceedsForwarded(id, launch.seller, amount);

        (bool ok, ) = payable(launch.seller).call{value: amount}("");
        require(ok, "Forward failed");
    }

    /// @dev Only auctions this factory created can pay it, and only during withdrawProceeds above.
    receive() external payable {
        require(_isAuction[msg.sender], "Unknown sender");
    }

    /// @notice Shows or hides a listing on the market page. Hiding is a display flag; the auction keeps running.
    function setHidden(uint256 id, bool hidden) external onlyCurator {
        _launches[id].hidden = hidden;
        emit LaunchHidden(id, hidden);
    }

    /// @notice Sets or clears a listing's "verified" badge. A display flag; no auction reads it.
    function setVerified(uint256 id, bool verified) external onlyCurator {
        _launches[id].verified = verified;
        emit LaunchVerified(id, verified);
    }

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function launchAt(uint256 id) external view returns (Launch memory) {
        return _launches[id];
    }

    /// @notice Listings oldest first, including hidden ones. An out-of-range offset returns an empty page.
    function getLaunches(uint256 offset, uint256 limit) external view returns (LaunchView[] memory page) {
        page = new LaunchView[](_pageSize(offset, limit));
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = _viewOf(offset + i);
        }
    }

    /// @notice `account`'s position in each listing of a page, in the same order as `getLaunches`.
    function getPositions(
        address account,
        uint256 offset,
        uint256 limit
    ) external view returns (PositionView[] memory page) {
        page = new PositionView[](_pageSize(offset, limit));
        for (uint256 i = 0; i < page.length; i++) {
            Launch storage launch = _launches[offset + i];
            DutchAuction auction = DutchAuction(launch.auction);
            page[i] = PositionView(
                offset + i,
                auction.commitments(account),
                auction.tokensOf(account),
                auction.claimed(account),
                HortonsToken(launch.token).balanceOf(account)
            );
        }
    }

    function _pageSize(uint256 offset, uint256 limit) private view returns (uint256) {
        uint256 total = _launches.length;
        if (offset >= total) return 0;
        uint256 size = limit < MAX_PAGE ? limit : MAX_PAGE;
        return total - offset < size ? total - offset : size;
    }

    function _viewOf(uint256 id) private view returns (LaunchView memory v) {
        Launch storage launch = _launches[id];
        DutchAuction auction = DutchAuction(launch.auction);
        HortonsToken token = HortonsToken(launch.token);
        v.id = id;
        v.token = launch.token;
        v.auction = launch.auction;
        v.seller = launch.seller;
        v.createdBlock = launch.createdBlock;
        v.hidden = launch.hidden;
        v.verified = launch.verified;
        v.name = token.name();
        v.symbol = token.symbol();
        v.supply = auction.totalTokens();
        v.startPrice = auction.startPrice();
        v.reservePrice = auction.reservePrice();
        v.currentPrice = auction.currentPrice();
        v.totalCommitted = auction.totalCommitted();
        v.clearingPrice = auction.clearingPrice();
        v.startTime = auction.startTime();
        v.endTime = auction.endTime();
        v.finalized = auction.finalized();
        v.proceedsWithdrawn = auction.proceedsWithdrawn();
    }
}
