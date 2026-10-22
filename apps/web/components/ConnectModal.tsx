"use client";

/**
 * ConnectModal — two-step wallet connection flow.
 *
 * Step 1: "Choose network" — two cards (Sonic, Avalanche).
 *         Selecting a card sets the chain in ChainContext.
 * Step 2: Connect using the right wallet for that chain via EIP-6963.
 *         - Avalanche: Core first, MetaMask fallback, install links if neither.
 *         - Sonic: MetaMask first, other supported wallets listed.
 */

import { useState, useEffect, useCallback } from "react";
import { useChain, CHAIN_METADATA, SELECTABLE_CHAINS, type SelectableChainId } from "@/context/ChainContext";
import { useWallet } from "@/context/WalletContext";
import {
  discoverProviders,
  connectToWallet,
  WALLET_RDNS,
  type EIP6963AnnounceProviderEvent,
} from "@/lib/eip6963";
import { avalancheFuji } from "viem/chains";
import { sonicTestnet } from "@predict-me/core";
import { X, Loader2, ExternalLink, AlertCircle, ArrowLeft } from "lucide-react";

// Minimal chain params for wallet_addEthereumChain
const CHAIN_PARAMS: Record<string, { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number } }> = {
  avalanche: {
    chainId: "0xA869", // 43113 hex
    chainName: "Avalanche Fuji Testnet",
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  },
  sonic: {
    chainId: "0x3919", // 14601 hex
    chainName: "Sonic Testnet",
    rpcUrls: ["https://rpc.testnet.soniclabs.com"],
    nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
  },
};

type Step = "choose-network" | "connecting" | "wallet-error" | "wallet-not-found";

export default function ConnectModal({ onClose }: { onClose: () => void }) {
  const { setChain } = useChain();
  const { switchNetwork } = useWallet();
  const [step, setStep] = useState<Step>("choose-network");
  const [selectedChain, setSelectedChain] = useState<SelectableChainId | null>(null);
  const [error, setError] = useState<string>("");
  const [providers, setProviders] = useState<EIP6963AnnounceProviderEvent[]>([]);
  const [connectingWallet, setConnectingWallet] = useState<string>("");

  // Discover providers once on mount
  useEffect(() => {
    discoverProviders().then(setProviders);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleChooseNetwork = async (id: SelectableChainId) => {
    // Step 1: set the chain
    setChain(id);
    setSelectedChain(id);
    setStep("connecting");
    setError("");

    // Discover what's installed
    const installed = await discoverProviders();
    setProviders(installed);

    // Determine wallet priority for this chain
    let targetRdns: string | null = null;

    if (id === "avalanche") {
      // Core first, MetaMask fallback
      const hasCore = installed.some((p) => p.info.rdns === WALLET_RDNS.core);
      if (hasCore) {
        targetRdns = WALLET_RDNS.core;
      } else {
        const hasMetaMask = installed.some((p) => p.info.rdns === WALLET_RDNS.metamask);
        if (hasMetaMask) {
          targetRdns = WALLET_RDNS.metamask;
        } else {
          // Neither installed
          setStep("wallet-not-found");
          return;
        }
      }
    } else {
      // Sonic: MetaMask first
      const hasMetaMask = installed.some((p) => p.info.rdns === WALLET_RDNS.metamask);
      if (hasMetaMask) {
        targetRdns = WALLET_RDNS.metamask;
      } else {
        // Show not-found but list alternatives
        setStep("wallet-not-found");
        return;
      }
    }

    if (!targetRdns) {
      setStep("wallet-not-found");
      return;
    }

    // Step 2: connect to the specific wallet via EIP-6963
    setConnectingWallet(targetRdns);
    try {
      await connectToWallet(targetRdns);

      // Connection succeeded — now switch the wallet to the chosen chain.
      // wagmi will pick up the account via its event listeners.
      // Give wagmi a tick to register the new account.
      await new Promise((r) => setTimeout(r, 200));

      // Try switching network. If the wallet doesn't know the chain,
      // add it first via wallet_addEthereumChain, then switch.
      try {
        await switchNetwork();
      } catch (switchErr) {
        // wagmi's switchChainAsync handles add-chain internally in most cases.
        // If it fails, try a raw wallet_addEthereumChain via the EIP-6963 provider.
        try {
          const announce = await import("@/lib/eip6963").then((m) => m.findProvider(targetRdns));
          if (announce) {
            const params = CHAIN_PARAMS[id];
            await announce.provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: params.chainId }],
            });
          }
        } catch (addErr) {
          // If switch/add fails, the user is still connected — just on the wrong chain.
          // The TopBar will show the "Switch to X" button. Don't block.
          console.warn("Network switch failed:", addErr);
        }
      }

      // Success — close the modal
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("rejected") ||
        msg.toLowerCase().includes("denied") ||
        msg.toLowerCase().includes("cancelled") ||
        msg.toLowerCase().includes("canceled") ||
        msg.toLowerCase().includes("closed")
      ) {
        setError("Connection request was cancelled. You can try again or browse markets in read-only mode.");
      } else if (msg.toLowerCase().includes("not installed")) {
        setStep("wallet-not-found");
        return;
      } else {
        setError(msg);
      }
      setStep("wallet-error");
    } finally {
      setConnectingWallet("");
    }
  };

  const meta = selectedChain ? CHAIN_METADATA[selectedChain] : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "#0D111A",
          border: "1px solid #1E2435",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1E2435" }}>
          <div className="flex items-center gap-2">
            {step !== "choose-network" && step !== "wallet-not-found" && (
              <button
                onClick={() => setStep("choose-network")}
                className="p-1 rounded-lg transition-colors hover:bg-[#1E2435]"
                style={{ color: "#8B93A7" }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="text-base font-bold" style={{ color: "#F2F4F7" }}>
              {step === "choose-network" && "Choose network"}
              {step === "connecting" && `Connecting to ${meta?.shortName ?? ""}`}
              {step === "wallet-error" && "Connection failed"}
              {step === "wallet-not-found" && "Wallet not found"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[#1E2435]"
            style={{ color: "#8B93A7" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* ── Step 1: Choose network ── */}
          {step === "choose-network" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs mb-1" style={{ color: "#8B93A7" }}>
                Select a network to connect your wallet.
              </p>
              {SELECTABLE_CHAINS.map((id) => {
                const m = CHAIN_METADATA[id];
                return (
                  <button
                    key={id}
                    onClick={() => handleChooseNetwork(id)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl transition-all text-left group"
                    style={{
                      backgroundColor: "#161B26",
                      border: `1px solid #1E2435`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = m.borderColor;
                      e.currentTarget.style.backgroundColor = m.badgeBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#1E2435";
                      e.currentTarget.style.backgroundColor = "#161B26";
                    }}
                  >
                    {/* Icon dot */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: m.badgeBg, border: `1px solid ${m.borderColor}` }}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: m.color, boxShadow: `0 0 10px ${m.color}` }}
                      />
                    </div>
                    {/* Name + currency */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: "#F2F4F7" }}>
                          {m.name}
                        </span>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#8B93A7" }}
                        >
                          Testnet
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: "#8B93A7" }}>
                        {m.capabilities?.currencySymbol ?? m.currency} · Chain {m.evmChainId}
                      </span>
                    </div>
                    <ArrowLeft size={16} className="rotate-180 opacity-30 group-hover:opacity-60" style={{ color: m.color }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 2a: Connecting ── */}
          {step === "connecting" && (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <Loader2 size={32} className="animate-spin" style={{ color: meta?.color ?? "#8B5CF6" }} />
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#F2F4F7" }}>
                  {connectingWallet === WALLET_RDNS.core ? "Opening Core wallet…" : "Opening MetaMask…"}
                </p>
                <p className="text-xs" style={{ color: "#8B93A7" }}>
                  Approve the connection request in your wallet extension.
                  You&apos;ll be asked to switch to {meta?.name ?? "the selected network"} next.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2b: Error ── */}
          {step === "wallet-error" && (
            <div className="flex flex-col gap-4">
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ backgroundColor: "#1A0F14", border: "1px solid #FF4D5E44" }}
              >
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#FF4D5E]" />
                <p className="text-xs leading-relaxed" style={{ color: "#8B93A7" }}>
                  {error}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("choose-network")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ backgroundColor: "#1E2435", color: "#F2F4F7" }}
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ backgroundColor: "transparent", border: "1px solid #1E2435", color: "#8B93A7" }}
                >
                  Browse without wallet
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2c: Wallet not found ── */}
          {step === "wallet-not-found" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <p className="text-sm" style={{ color: "#F2F4F7" }}>
                  {selectedChain === "avalanche"
                    ? "Neither Core nor MetaMask was detected."
                    : "MetaMask was not detected."}
                </p>
                <p className="text-xs" style={{ color: "#8B93A7" }}>
                  Install a supported wallet extension to connect and start trading.
                </p>
              </div>

              {/* Install links */}
              <div className="flex flex-col gap-2.5">
                {selectedChain === "avalanche" && (
                  <a
                    href="https://core.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
                    style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "rgba(232, 65, 66, 0.15)" }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#E84142" }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold" style={{ color: "#F2F4F7" }}>Core Wallet</p>
                      <p className="text-xs" style={{ color: "#8B93A7" }}>Recommended for Avalanche</p>
                    </div>
                    <ExternalLink size={14} style={{ color: "#8B93A7" }} />
                  </a>
                )}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
                  style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "rgba(255, 165, 0, 0.15)" }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FFA500" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: "#F2F4F7" }}>MetaMask</p>
                    <p className="text-xs" style={{ color: "#8B93A7" }}>Works on all EVM chains</p>
                  </div>
                  <ExternalLink size={14} style={{ color: "#8B93A7" }} />
                </a>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ backgroundColor: "transparent", border: "1px solid #1E2435", color: "#8B93A7" }}
              >
                Browse without wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
