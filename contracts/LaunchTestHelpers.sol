// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Forces ETH into an address past any receive() guard.
contract ForceSend {
    constructor(address payable to) payable {
        selfdestruct(to);
    }
}

/// @notice A contract seller that replays a chosen call from inside its receive().
contract ReentrantSeller {
    address public target;
    bytes public payload;
    bool public rejecting;
    uint256 public attempts;
    uint256 public successes;
    uint256 public received;

    function setReplay(address _target, bytes calldata _payload) external {
        target = _target;
        payload = _payload;
    }

    function setRejecting(bool r) external {
        rejecting = r;
    }

    function exec(address to, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        require(!rejecting, "Seller rejects");
        received += msg.value;
        if (target != address(0) && attempts == 0) {
            attempts++;
            (bool ok, ) = target.call(payload);
            if (ok) successes++;
        }
    }
}
