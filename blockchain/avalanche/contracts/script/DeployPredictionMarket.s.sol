// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/PredictionMarket.sol";

/**
 * @title DeployPredictionMarket
 * @notice Foundry deployment script for PredictionMarket targeting Avalanche Fuji testnet or Avalanche Mainnet.
 * 
 * Usage:
 *   forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
 *     --rpc-url $FUJI_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 */
contract DeployPredictionMarket is Script {
    function run() external returns (PredictionMarket) {
        // Read private key from environment variables (supports PRIVATE_KEY or DEPLOYER_PRIVATE_KEY)
        uint256 deployerPrivateKey;
        if (vm.envOr("PRIVATE_KEY", uint256(0)) != 0) {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        } else {
            deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        }

        address deployerAddress = vm.addr(deployerPrivateKey);

        console.log("==================================================");
        console.log("Deploying PredictionMarket to Avalanche Fuji Testnet");
        console.log("Deployer Address:", deployerAddress);
        console.log("Deployer Balance:", deployerAddress.balance);
        console.log("Chain ID:        ", block.chainid);
        console.log("==================================================");

        vm.startBroadcast(deployerPrivateKey);

        PredictionMarket predictionMarket = new PredictionMarket();

        vm.stopBroadcast();

        console.log("\n==================================================");
        console.log(" Deployment Successful!");
        console.log("==================================================");
        console.log("Contract Address:", address(predictionMarket));
        console.log("Contract Owner:  ", predictionMarket.owner());
        console.log("==================================================\n");

        return predictionMarket;
    }
}
