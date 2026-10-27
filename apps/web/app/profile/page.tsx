"use client";

import { useWallet } from "@/context/WalletContext";
import ProfileView from "@/components/ProfileView";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { Wallet } from "lucide-react";

export default function MyProfilePage() {
  const { publicKey, connected, connect, connecting } = useWallet();
  const { chainMetadata } = useChain();

  if (!connected || !publicKey) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center text-center gap-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
        >
          <Wallet size={28} color="#8B93A7" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-extrabold mb-2" style={{ color: "#F2F4F7" }}>
            Your Profile
          </h1>
          <p className="text-sm" style={{ color: "#8B93A7" }}>
            Connect your wallet to view your trading history and performance.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={connecting}
          className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{ backgroundColor: chainMetadata.color, color: "#FFFFFF" }}
        >
          <Wallet size={15} strokeWidth={2} />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  return <ProfileView wallet={publicKey} />;
}
