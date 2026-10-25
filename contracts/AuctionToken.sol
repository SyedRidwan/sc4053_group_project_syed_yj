// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract AuctionToken is ERC20, ERC20Burnable {

    constructor(uint256 initialSupply)
        ERC20("Hortons", "TIM")
    {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}