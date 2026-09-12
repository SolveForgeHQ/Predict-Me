"use client";

import { useState, useRef, useEffect } from "react";
import { useChain, type ChainId } from "@/context/ChainContext";
import { ChevronDown, Check } from "lucide-react";

export default function ChainSwitcher() {
  const { chain, chainMetadata, setChain } = useChain();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const chains: { id: ChainId; name: string; currency: string; color: string }[] = [
    {
      id: "avalanche",
      name: "Avalanche",
      currency: "AVAX",
      color: "#E84142",
    },
    {
      id: "stellar",
      name: "Stellar",
      currency: "XLM",
      color: "#00D084",
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
        style={{
          backgroundColor: chainMetadata.badgeBg,
          borderColor: chainMetadata.borderColor,
          color: "#F2F4F7",
        }}
        title={`Current chain: ${chainMetadata.name}`}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: chainMetadata.color,
            boxShadow: `0 0 8px ${chainMetadata.color}`,
          }}
        />
        <span className="font-bold">{chainMetadata.shortName}</span>
        <span className="text-[10px] opacity-75 font-mono">({chainMetadata.currency})</span>
        <ChevronDown size={12} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-48 rounded-xl overflow-hidden py-1 z-50 shadow-2xl border"
          style={{
            backgroundColor: "#161B26",
            borderColor: "#1E2435",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          }}
        >
          <div className="px-3 py-2 border-b border-[#1E2435]">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#8B93A7]">
              Select Network
            </p>
          </div>

          <div className="py-1">
            {chains.map((item) => {
              const isSelected = item.id === chain;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setChain(item.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left group"
                  style={{
                    backgroundColor: isSelected ? "rgba(255,255,255,0.05)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: item.color,
                        boxShadow: isSelected ? `0 0 6px ${item.color}` : "none",
                      }}
                    />
                    <div className="flex flex-col">
                      <span className={`font-semibold ${isSelected ? "text-white" : "text-[#D0D5DD]"}`}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-[#8B93A7]">{item.currency} Market</span>
                    </div>
                  </div>

                  {isSelected && <Check size={14} style={{ color: item.color }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
