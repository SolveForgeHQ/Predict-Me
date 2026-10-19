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
        // Read private key from environment (supports PRIVATE_KEY or DEPLOYER_PRIVATE_KEY,
        // with or without 0x prefix — see .env.example).
        uint256 deployerPrivateKey = _readPrivateKey();

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

    /// @dev Reads PRIVATE_KEY (fallback DEPLOYER_PRIVATE_KEY), accepting hex
    ///      with or without the 0x prefix.
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
