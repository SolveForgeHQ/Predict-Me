// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

/**
 * @title FeeOnTransferToken
 * @notice ERC-20 that deducts a fee on every transfer, so the recipient receives
 *         less than the sender sent. Used to verify the market rejects these tokens.
 */
contract FeeOnTransferToken is MockERC20 {
    uint256 public feeBps; // basis points, e.g. 100 = 1%

    constructor(uint256 _feeBps) {
        feeBps = _feeBps;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        _transfer(msg.sender, to, net);
        if (fee > 0) {
            _transfer(msg.sender, address(0xBEEF), fee);
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        _transfer(from, to, net);
        if (fee > 0) {
            _transfer(from, address(0xBEEF), fee);
        }
        return true;
    }
}
