import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BACKEND_URL:
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787",

    // Sonic Testnet (chain 14601)
    NEXT_PUBLIC_SONIC_RPC_URL:
      process.env.NEXT_PUBLIC_SONIC_RPC_URL ?? "https://rpc.testnet.soniclabs.com",
    NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS:
      process.env.NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
    NEXT_PUBLIC_SONIC_TOKEN_ADDRESS:
      process.env.NEXT_PUBLIC_SONIC_TOKEN_ADDRESS ?? "",

    // Avalanche Fuji (chain 43113)
    NEXT_PUBLIC_AVALANCHE_RPC_URL:
      process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
    NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS:
      process.env.NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  },
};

export default nextConfig;
