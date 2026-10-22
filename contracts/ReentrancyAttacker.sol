// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDutchAuction {
    function bid() external payable;
    function claim() external;
    function finalize() external;
}

/// @title Test-only attacker for the reentrancy bonus
/// @notice Bridges the sell-out threshold so the auction refunds it, then tries to re-enter
///         every state-changing function from inside the refund callback.
contract ReentrancyAttacker {
    IDutchAuction public immutable auction;
    bool public rejectRefunds;
    uint256 public reentryAttempts;
    uint256 public reentrySuccesses;

    constructor(address _auction) {
        auction = IDutchAuction(_auction);
    }

    function setRejectRefunds(bool _reject) external {
        rejectRefunds = _reject;
    }

    function attackBid() external payable {
        auction.bid{value: msg.value}();
    }

    function claim() external {
        auction.claim();
    }

    receive() external payable {
        require(!rejectRefunds, "Refund rejected");
        if (reentryAttempts > 0) {
            return;
        }
        reentryAttempts++;

        try auction.bid{value: msg.value}() {
            reentrySuccesses++;
        } catch {}
        try auction.claim() {
            reentrySuccesses++;
        } catch {}
        try auction.finalize() {
            reentrySuccesses++;
        } catch {}
    }
}
