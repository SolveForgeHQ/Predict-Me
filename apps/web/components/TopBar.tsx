"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { truncateAddress } from "@/lib/wallet";
import { LogOut, Copy, Check, Loader2 } from "lucide-react";

export default function TopBar() {
  const { publicKey, connected, connecting, error, connect, disconnect, clearError } =
    useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {/* ── Floating pill top bar ─────────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-4 pb-2 pointer-events-none">
        <header
          className="pointer-events-auto w-full max-w-2xl flex items-center justify-between px-5 rounded-full"
          style={{
            background: "rgba(13,17,23,0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            height: "52px",
          }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center select-none">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: "#00D084" }}>
              predict
            </span>
            <span className="text-lg font-extrabold tracking-tight" style={{ color: "#F2F4F7" }}>
              -me
            </span>
          </Link>

          {/* Wallet button area */}
          <div className="relative" ref={dropdownRef}>
            {connected && publicKey ? (
              // Connected — show truncated address with dropdown
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="text-sm font-semibold px-3 py-1.5 rounded-full border transition-all duration-150 flex items-center gap-2"
                style={{
                  borderColor: "#00D08455",
                  color: "#00D084",
                  backgroundColor: "#00D08415",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#00D084", boxShadow: "0 0 6px #00D084" }}
                />
                {truncateAddress(publicKey)}
              </button>
            ) : (
              // Not connected
              <button
                onClick={connect}
                disabled={connecting}
                className="text-sm font-semibold px-4 py-1.5 rounded-full border transition-all duration-150 flex items-center gap-2"
                style={{
                  borderColor: "#00D084",
                  color: "#00D084",
                  backgroundColor: "transparent",
                  opacity: connecting ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (connecting) return;
                  const b = e.currentTarget;
                  b.style.backgroundColor = "#00D08422";
                  b.style.boxShadow = "0 0 16px #00D08450";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget;
                  b.style.backgroundColor = "transparent";
                  b.style.boxShadow = "none";
                }}
              >
                {connecting && <Loader2 size={13} className="animate-spin" />}
                {connecting ? "Connecting…" : "Connect Wallet"}
              </button>
            )}

            {/* Dropdown */}
            {dropdownOpen && publicKey && (
              <div
                className="absolute right-0 mt-2 rounded-xl overflow-hidden py-1 z-50"
                style={{
                  backgroundColor: "#161B26",
                  border: "1px solid #1E2435",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  minWidth: "200px",
                }}
              >
                {/* Full address (read-only) */}
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #1E2435" }}>
                  <p className="text-xs mb-0.5" style={{ color: "#8B93A7" }}>Connected as</p>
                  <p className="text-xs font-mono break-all" style={{ color: "#F2F4F7" }}>
                    {truncateAddress(publicKey)}
                  </p>
                </div>

                {/* Copy */}
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left"
                  style={{ color: "#F2F4F7" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1E2435")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {copied ? <Check size={14} color="#00D084" /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy address"}
                </button>

                {/* Disconnect */}
                <button
                  onClick={() => { disconnect(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left"
                  style={{ color: "#FF4D5E" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FF4D5E18")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <LogOut size={14} />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </header>
      </div>

      {/* ── Error toast ──────────────────────────────────────── */}
      {error && (
        <div
          className="fixed top-20 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
        >
          <div
            className="pointer-events-auto rounded-2xl px-5 py-4 max-w-sm w-full"
            style={{
              backgroundColor: "#1A0F14",
              border: "1px solid #FF4D5E44",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: "#FF4D5E" }}>
                  {error.code === "NOT_INSTALLED"
                    ? "Wallet not found"
                    : error.code === "REJECTED"
                    ? "Connection cancelled"
                    : error.code === "WRONG_NETWORK"
                    ? "Wrong network"
                    : error.code === "AUTH_FAILED"
                    ? "Login failed"
                    : "Connection failed"}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#8B93A7" }}>
                  {error.message}
                </p>
              </div>
              <button
                onClick={clearError}
                className="text-xs shrink-0 mt-0.5"
                style={{ color: "#8B93A7" }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
