"use client";

import React from "react";
import { Loader2, AlertCircle, CheckCircle2, AlertTriangle, Wallet, ExternalLink } from "lucide-react";

export type BannerVariant =
  | "pending"
  | "error"
  | "success"
  | "wallet_required"
  | "backend_offline"
  | "wrong_network";

interface Props {
  variant: BannerVariant;
  title?: string;
  message?: string;
  txHash?: string;
  stepLabel?: string;
  onAction?: () => void;
  actionLabel?: string;
}

export default function StatusBanner({
  variant,
  title,
  message,
  txHash,
  stepLabel,
  onAction,
  actionLabel,
}: Props) {
  // ── 1. Transaction Pending ──────────────────────────────────
  if (variant === "pending") {
    return (
      <div
        className="rounded-xl px-4 py-3 text-xs flex items-center gap-2.5"
        style={{
          backgroundColor: "#0D1829",
          border: "1px solid #1E3A5F",
          color: "#60A5FA",
        }}
      >
        <Loader2 size={15} className="animate-spin shrink-0 text-[#60A5FA]" />
        <span className="font-medium">{stepLabel ?? "Processing transaction…"}</span>
      </div>
    );
  }

  // ── 2. Error / Failed ───────────────────────────────────────
  if (variant === "error") {
    return (
      <div
        className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 leading-relaxed"
        style={{
          backgroundColor: "#1A0F14",
          border: "1px solid #FF4D5E44",
          color: "#FF4D5E",
        }}
      >
        <AlertCircle size={15} className="shrink-0 mt-0.5 text-[#FF4D5E]" />
        <div className="flex-1 min-w-0">
          <p className="font-bold">{title ?? "Transaction Failed"}</p>
          {message && <p className="opacity-90 text-[11px] mt-0.5">{message}</p>}
        </div>
      </div>
    );
  }

  // ── 3. Success ──────────────────────────────────────────────
  if (variant === "success") {
    return (
      <div
        className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 leading-relaxed"
        style={{
          backgroundColor: "#00D08418",
          border: "1px solid #00D08433",
          color: "#00D084",
        }}
      >
        <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-[#00D084]" />
        <div className="flex-1 min-w-0">
          <p className="font-bold">{title ?? "Transaction Confirmed!"}</p>
          {message && <p className="opacity-90 text-[11px] mt-0.5">{message}</p>}
          {txHash && (
            <a
              href={
                txHash.startsWith("0x")
                  ? `https://testnet.snowtrace.io/tx/${txHash}`
                  : `https://stellar.expert/explorer/testnet/tx/${txHash}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline opacity-85 hover:opacity-100 font-mono text-[11px] mt-1 break-all"
            >
              <span>{txHash.startsWith("0x") ? "View on Snowtrace (Fuji)" : "View on Stellar Expert"}</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── 4. Wallet Required ──────────────────────────────────────
  if (variant === "wallet_required") {
    return (
      <div
        className="rounded-xl p-4 text-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
        style={{
          backgroundColor: "#161B26",
          border: "1px solid #1E2435",
        }}
      >
        <div className="flex items-center gap-2.5">
          <Wallet size={16} className="text-[#8B93A7] shrink-0" />
          <span className="text-[#8B93A7]">
            {message ?? "Connect your wallet to trade and manage markets."}
          </span>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="btn-yes px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0"
          >
            {actionLabel ?? "Connect Wallet"}
          </button>
        )}
      </div>
    );
  }

  // ── 5. Backend Offline / Direct Chain Fallback ──────────────
  if (variant === "backend_offline") {
    return (
      <div
        className="rounded-xl px-4 py-2.5 text-xs flex items-center justify-between gap-2.5 mb-4"
        style={{
          backgroundColor: "#1C160D",
          border: "1px solid #F59E0B33",
          color: "#F59E0B",
        }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0 text-[#F59E0B]" />
          <span>Backend sync offline. Operating directly via Soroban RPC.</span>
        </div>
      </div>
    );
  }

  // ── 6. Wrong Network ───────────────────────────────────────
  if (variant === "wrong_network") {
    return (
      <div
        className="rounded-xl p-4 text-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
        style={{
          backgroundColor: "#20120D",
          border: "1px solid #E8414255",
          color: "#F2F4F7",
        }}
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={16} className="text-[#E84142] shrink-0" />
          <div>
            <p className="font-bold text-[#E84142]">{title ?? "Wrong Network"}</p>
            <p className="text-[#8B93A7] text-[11px] mt-0.5">
              {message ?? "Your wallet is connected to an unsupported network. Please switch to Avalanche Fuji."}
            </p>
          </div>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0 text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: "#E84142" }}
          >
            {actionLabel ?? "Switch Network"}
          </button>
        )}
      </div>
    );
  }

  return null;
}
