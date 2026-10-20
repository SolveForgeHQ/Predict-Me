import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Override at deploy time: NEXT_PUBLIC_BACKEND_URL=https://your-worker.workers.dev
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787",
    NEXT_PUBLIC_SONIC_RPC_URL: process.env.NEXT_PUBLIC_SONIC_RPC_URL ?? "https://rpc.testnet.soniclabs.com",
    NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  },
};

export default nextConfig;
