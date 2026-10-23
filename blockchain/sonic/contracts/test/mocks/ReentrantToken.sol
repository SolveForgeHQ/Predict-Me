// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMarket {
    function claimWinnings(uint256 marketId) external;
    function refund(uint256 marketId) external;
}

/**
 * @title ReentrantToken
 * @notice ERC-20 that calls back into the market on transfer, attempting to
 *         reenter claimWinnings or refund. Both should be blocked by ReentrancyGuard.
 */
contract ReentrantToken is MockERC20 {
    IMarket public target;
    uint256 public attackMarketId;
    bool public attackClaim; // true = reenter claimWinnings, false = reenter refund
    bool public armed;

    function arm(address _target, uint256 _marketId, bool _attackClaim) external {
        target = IMarket(_target);
        attackMarketId = _marketId;
        attackClaim = _attackClaim;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (armed && address(target) != address(0)) {
            armed = false; // prevent infinite loop
            if (attackClaim) {
                try target.claimWinnings(attackMarketId) {} catch {}
            } else {
                try target.refund(attackMarketId) {} catch {}
            }
        }
        return super.transfer(to, amount);
    }
}
