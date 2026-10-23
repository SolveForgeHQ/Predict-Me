// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/PredictionMarket.sol";

/**
 * @title DeployPredictionMarket
 * @notice Foundry deployment script for PredictionMarket targeting Avalanche Fuji testnet.
 *
 * Environment variables:
 *   PRIVATE_KEY           — deployer private key (with or without 0x prefix)  [required]
 *   OWNER_ADDRESS         — market owner address (defaults to deployer)        [optional]
 *   MIN_STAKE             — minimum AVAX per buyShares in wei (default: 0.01 AVAX = 1e16) [optional]
 *   GRACE_PERIOD          — resolution grace period in seconds (default: 604800 = 7 days)  [optional]
 *
 * Usage:
 *   forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
 *     --rpc-url $FUJI_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvvv
 */
contract DeployPredictionMarket is Script {
    function run() external returns (PredictionMarket) {
        uint256 deployerPrivateKey = _readPrivateKey();
        address deployerAddress    = vm.addr(deployerPrivateKey);

        // Owner defaults to deployer if not set
        string memory ownerStr = vm.envOr("OWNER_ADDRESS", string(""));
        address ownerAddress   = bytes(ownerStr).length == 0
            ? deployerAddress
            : vm.parseAddress(ownerStr);

        // 0.01 AVAX in wei = 1e16
        uint256 minStake      = vm.envOr("MIN_STAKE",    uint256(1e16));
        uint256 gracePeriod   = vm.envOr("GRACE_PERIOD", uint256(604800));

        console.log("==================================================");
        console.log("Deploying PredictionMarket to Avalanche Fuji Testnet");
        console.log("Deployer:     ", deployerAddress);
        console.log("Owner:        ", ownerAddress);
        console.log("Min Stake:    ", minStake, "wei");
        console.log("Grace Period: ", gracePeriod, "seconds");
        console.log("Chain ID:     ", block.chainid);
        console.log("==================================================");

        vm.startBroadcast(deployerPrivateKey);

        PredictionMarket market = new PredictionMarket(
            ownerAddress,
            minStake,
            gracePeriod
        );

        vm.stopBroadcast();

        console.log("\n==================================================");
        console.log(" Deployment Successful!");
        console.log("==================================================");
        console.log("Contract Address:", address(market));
        console.log("Owner:           ", market.owner());
        console.log("Min Stake:       ", market.minStake());
        console.log("Grace Period:    ", market.resolutionGracePeriod());
        console.log("==================================================\n");

        return market;
    }

    /// @dev Reads PRIVATE_KEY (fallback DEPLOYER_PRIVATE_KEY), with or without 0x prefix.
    function _readPrivateKey() internal returns (uint256) {
        string memory pk = vm.envOr("PRIVATE_KEY", string(""));
        if (bytes(pk).length == 0) {
            pk = vm.envString("DEPLOYER_PRIVATE_KEY");
        }
        bytes memory b = bytes(pk);
        if (b.length >= 2 && b[0] == bytes1("0") && (b[1] == bytes1("x") || b[1] == bytes1("X"))) {
            return vm.parseUint(pk);
        }
        return vm.parseUint(string.concat("0x", pk));
    }
}
