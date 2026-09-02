// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PredictionMarket {
    function createMarket(string memory title, string memory description, uint256 endDate) external returns (uint256) {
        // TODO: implement
        return 0;
    }

    function buyShares(uint256 marketId, uint8 outcome, uint256 amount) external {
        // TODO: implement
    }

    function resolveMarket(uint256 marketId, uint8 winningOutcome) external {
        // TODO: implement
    }

    function claimWinnings(uint256 marketId) external {
        // TODO: implement
    }
}
