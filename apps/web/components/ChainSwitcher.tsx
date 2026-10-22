"use client";

import { useState, useRef, useEffect } from "react";
import { useChain, CHAIN_METADATA, SELECTABLE_CHAINS, type SelectableChainId } from "@/context/ChainContext";
import { useWallet } from "@/context/WalletContext";
import { ChevronDown, Check } from "lucide-react";

export default function ChainSwitcher() {
  const { chain, chainMetadata, setChain } = useChain();
  const { connected, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (id: SelectableChainId) => {
    setChain(id);
    setOpen(false);
    // If a wallet is already connected, ask it to switch to the new chain.
    // switchNetwork reads from WalletContext which will update after setChain.
    // We call it after a tick so ChainContext has updated expectedEvmChainId.
    if (connected) {
      await new Promise((r) => setTimeout(r, 0));
      switchNetwork().catch(() => { /* user may dismiss — not fatal */ });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Pill button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
        style={{
          backgroundColor: chainMetadata.badgeBg,
          borderColor: chainMetadata.borderColor,
          color: "#F2F4F7",
        }}
        title={`Network: ${chainMetadata.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: chainMetadata.color, boxShadow: `0 0 8px ${chainMetadata.color}` }}
        />
        <span className="font-bold">{chainMetadata.shortName}</span>
        <span
          className="text-[9px] font-semibold px-1 py-0.5 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#8B93A7" }}
        >
          Testnet
        </span>
        <ChevronDown size={11} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-52 rounded-xl overflow-hidden py-1 z-50 shadow-2xl border"
          style={{ backgroundColor: "#161B26", borderColor: "#1E2435", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
        >
          <div className="px-3 py-2 border-b border-[#1E2435]">
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#8B93A7" }}>
              Select Network
            </p>
          </div>

          <div className="py-1">
            {SELECTABLE_CHAINS.map((id) => {
              const meta = CHAIN_METADATA[id];
              const caps = meta.capabilities;
              const isSelected = id === chain;
              return (
                <button
                  key={id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors text-left"
                  style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.05)" : "transparent" }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: meta.color, boxShadow: isSelected ? `0 0 6px ${meta.color}` : "none" }}
                    />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${isSelected ? "text-white" : "text-[#D0D5DD]"}`}>
                          {meta.name}
                        </span>
                        <span
                          className="text-[9px] font-semibold px-1 rounded"
                          style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "#8B93A7" }}
                        >
                          Testnet
                        </span>
                      </div>
                      <span className="text-[10px]" style={{ color: "#8B93A7" }}>
                        {caps?.currencySymbol ?? meta.currency} · Chain {caps?.evmChainId ?? meta.evmChainId}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check size={13} style={{ color: meta.color, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
