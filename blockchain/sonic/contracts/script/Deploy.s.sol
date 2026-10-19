// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarketERC20} from "../src/PredictionMarketERC20.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/**
 * @title Deploy
 * @notice Deploys PredictionMarketERC20 (and optionally MockERC20) to Sonic testnet.
 *
 * Environment variables:
 *   PRIVATE_KEY     — deployer private key (with or without 0x prefix)   [required]
 *   TOKEN_ADDRESS   — ERC-20 token address to use for staking             [optional]
 *   OWNER_ADDRESS   — market owner (can differ from deployer)             [optional, defaults to deployer]
 *   MIN_STAKE       — minimum stake in base units                          [optional, default 1_000_000]
 *   GRACE_PERIOD    — resolution grace period in seconds                  [optional, default 86_400]
 *
 * If TOKEN_ADDRESS is not set, a MockERC20 is deployed and used instead.
 * This is for testing only — a clear warning is printed.
 */
contract Deploy is Script {
    function run() external returns (PredictionMarketERC20) {
        // ── Read private key (accepts with or without 0x prefix) ──
        string memory pkStr = vm.envString("PRIVATE_KEY");
        if (bytes(pkStr).length < 2 || bytes(pkStr)[0] != 0x30 || bytes(pkStr)[1] != 0x78) {
            pkStr = string.concat("0x", pkStr);
        }
        uint256 deployerPrivateKey = vm.parseUint(pkStr);
        address deployer = vm.addr(deployerPrivateKey);

        // ── Read optional config with defaults ──
        uint256 minStake = vm.envOr("MIN_STAKE", uint256(1_000_000));
        uint256 gracePeriod = vm.envOr("GRACE_PERIOD", uint256(86_400));

        string memory ownerStr = vm.envOr("OWNER_ADDRESS", string(""));
        address ownerAddress = bytes(ownerStr).length == 0 ? deployer : vm.parseAddress(ownerStr);

        // ── Token address ──
        string memory tokenStr = vm.envOr("TOKEN_ADDRESS", string(""));
        address tokenAddress;

        vm.startBroadcast(deployerPrivateKey);

        if (bytes(tokenStr).length == 0) {
            console.log("==========================================================");
            console.log("WARNING: TOKEN_ADDRESS not set.");
            console.log("         Deploying MockERC20 as a test token.");
            console.log("         DO NOT use this in production!");
            console.log("==========================================================");
            MockERC20 mockToken = new MockERC20();
            tokenAddress = address(mockToken);
            console.log("MockERC20 deployed at:", tokenAddress);
        } else {
            tokenAddress = vm.parseAddress(tokenStr);
        }

        PredictionMarketERC20 market = new PredictionMarketERC20(tokenAddress, ownerAddress, minStake, gracePeriod);

        vm.stopBroadcast();

        console.log("==========================================================");
        console.log(" PredictionMarketERC20 deployed!");
        console.log("==========================================================");
        console.log("Contract Address:", address(market));
        console.log("Token Address:   ", tokenAddress);
        console.log("Owner:           ", ownerAddress);
        console.log("Min Stake:       ", minStake);
        console.log("Grace Period:    ", gracePeriod);
        console.log("Chain ID:        ", block.chainid);
        console.log("==========================================================");

        return market;
    }
}
