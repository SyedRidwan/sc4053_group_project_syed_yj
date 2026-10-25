// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDutchAuction {
    function bid() external payable;
    function claim() external;
}

contract ReentrancyAttacker {

    IDutchAuction public immutable auction;

    bool public attackAttempted;
    bool public reentrySucceeded;

    constructor(address _auction) {
        auction = IDutchAuction(_auction);
    }

    // Bid into the Dutch auction as this contract
    function placeBid()
        external
        payable
    {
        auction.bid{value: msg.value}();
    }

    // Start the legitimate first claim.
    // The reentrancy attempt happens when the refund arrives.
    function attackClaim()
        external
    {
        auction.claim();
    }

    // DutchAuction sends the ETH refund here.
    receive() external payable {

        // Only try re-entering once.
        if (!attackAttempted) {
            attackAttempted = true;

            // Attempt to call claim() AGAIN
            // while the first claim() is still executing.
            (bool success, ) =
                address(auction).call(
                    abi.encodeWithSignature(
                        "claim()"
                    )
                );

            reentrySucceeded = success;
        }
    }
}