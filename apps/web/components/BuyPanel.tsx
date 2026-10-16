"use client";
// BuyPanel.tsx — legacy trade panel (TradePanel is the active component).
// Kept for reference; now renders N outcomes instead of hardcoded YES/NO.

import { useState } from "react";
import { Market } from "@/lib/types";
import { outcomeColor } from "@/lib/types";

interface Props {
  market: Market;
}

export default function BuyPanel({ market }: Props) {
  const outcomes = market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"];
  const percents = market.outcomePercents.length === outcomes.length
    ? market.outcomePercents
    : outcomes.map(() => Math.round(100 / outcomes.length));
  const [tab, setTab] = useState(0);
  const [amounts, setAmounts] = useState<string[]>(outcomes.map(() => ""));

  const price = (percents[tab] ?? 50) / 100;
  const amount = amounts[tab] ?? "";
  const est = amount && parseFloat(amount) > 0 && price > 0
    ? (parseFloat(amount) / price).toFixed(2) : "—";
  const color = outcomeColor(tab);

  const handleBuy = () => console.log(`Buy ${outcomes[tab]} stub — wire contract`);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
        boxShadow: `0 0 40px ${color}14`,
        transition: "box-shadow 0.3s ease",
      }}
    >
      {/* Tabs — N outcomes */}
      <div className="grid grid-cols-2" style={{ borderBottom: "1px solid #1E2435" }}>
        {outcomes.map((label, i) => {
          const c = outcomeColor(i);
          const active = tab === i;
          return (
            <button
              key={`${label}-${i}`}
              onClick={() => setTab(i)}
              className="side-tab py-3 px-2 text-sm font-bold truncate"
              style={{
                color: active ? c : "#8B93A7",
                backgroundColor: active ? `${c}12` : "transparent",
                borderBottom: active ? `2px solid ${c}` : "2px solid transparent",
              }}
            >
              Buy {label}
            </button>
          );
        })}
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "#8B93A7" }}>Current price</p>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {percents[tab]}¢
          </span>
        </div>

        <div>
          <label className="text-xs mb-2 block" style={{ color: "#8B93A7" }}>Amount (XLM)</label>
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{ border: `1px solid ${color}44`, backgroundColor: "#0B0E14" }}
          >
            <span className="pl-3 text-sm select-none" style={{ color: "#8B93A7" }}>$</span>
            <input
              type="number" min="0" placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const next = [...amounts];
                next[tab] = e.target.value;
                setAmounts(next);
              }}
              className="flex-1 bg-transparent py-3 pr-3 text-sm outline-none"
              style={{ color: "#F2F4F7" }}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-between text-xs rounded-lg px-3 py-2"
          style={{ backgroundColor: "#0B0E14" }}
        >
          <span style={{ color: "#8B93A7" }}>Est. shares</span>
          <span style={{ color: "#F2F4F7", fontWeight: 700 }}>{est}</span>
        </div>

        <button
          onClick={handleBuy}
          className="w-full text-white"
          style={{ backgroundColor: color, padding: "0.875rem", borderRadius: "0.75rem", fontWeight: 700, fontSize: "0.875rem" }}
        >
          Buy {outcomes[tab]}
        </button>

        <p className="text-xs text-center" style={{ color: "#8B93A7" }}>
          Connect wallet to place trades.
        </p>
      </div>
    </div>
  );
}
