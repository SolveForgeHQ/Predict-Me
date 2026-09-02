"use client";
// BuyPanel.tsx — tabbed YES/NO trade panel used in the market detail page.

import { useState } from "react";
import { Market } from "@/lib/types";

interface Props {
  market: Market;
}

export default function BuyPanel({ market }: Props) {
  const [tab, setTab]         = useState<"YES" | "NO">("YES");
  const [yesAmount, setYes]   = useState("");
  const [noAmount,  setNo]    = useState("");

  const yesPrice = market.yesPercent / 100;
  const noPrice  = market.noPercent  / 100;

  const estYes = yesAmount && parseFloat(yesAmount) > 0
    ? (parseFloat(yesAmount) / yesPrice).toFixed(2) : "—";
  const estNo  = noAmount  && parseFloat(noAmount)  > 0
    ? (parseFloat(noAmount)  / noPrice ).toFixed(2) : "—";

  const isYes = tab === "YES";

  const handleBuyYes = () => console.log("Buy YES stub — wire contract");
  const handleBuyNo  = () => console.log("Buy NO stub  — wire contract");

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
        boxShadow: isYes ? "0 0 40px rgba(0,208,132,0.08)" : "0 0 40px rgba(255,77,94,0.08)",
        transition: "box-shadow 0.3s ease",
      }}
    >
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: "1px solid #1E2435" }}>
        {(["YES", "NO"] as const).map((side) => (
          <button
            key={side}
            onClick={() => setTab(side)}
            className="side-tab flex-1 py-3 text-sm font-bold"
            style={{
              color: tab === side ? (side === "YES" ? "#00D084" : "#FF4D5E") : "#8B93A7",
              backgroundColor: tab === side ? (side === "YES" ? "#00D08412" : "#FF4D5E12") : "transparent",
              borderBottom: tab === side ? `2px solid ${side === "YES" ? "#00D084" : "#FF4D5E"}` : "2px solid transparent",
            }}
          >
            Buy {side}
          </button>
        ))}
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "#8B93A7" }}>Current price</p>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{
              backgroundColor: isYes ? "#00D08422" : "#FF4D5E22",
              color: isYes ? "#00D084" : "#FF4D5E",
            }}
          >
            {isYes ? market.yesPercent : market.noPercent}¢
          </span>
        </div>

        <div>
          <label className="text-xs mb-2 block" style={{ color: "#8B93A7" }}>Amount (XLM)</label>
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${isYes ? "#00D08444" : "#FF4D5E44"}`,
              backgroundColor: "#0B0E14",
            }}
          >
            <span className="pl-3 text-sm select-none" style={{ color: "#8B93A7" }}>$</span>
            <input
              type="number" min="0" placeholder="0.00"
              value={isYes ? yesAmount : noAmount}
              onChange={(e) => isYes ? setYes(e.target.value) : setNo(e.target.value)}
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
          <span style={{ color: "#F2F4F7", fontWeight: 700 }}>{isYes ? estYes : estNo}</span>
        </div>

        <button
          onClick={isYes ? handleBuyYes : handleBuyNo}
          className={isYes ? "btn-yes" : "btn-no"}
          style={{ padding: "0.875rem", borderRadius: "0.75rem", fontWeight: 700, fontSize: "0.875rem" }}
        >
          Buy {tab}
        </button>

        <p className="text-xs text-center" style={{ color: "#8B93A7" }}>
          Connect wallet to place trades.
        </p>
      </div>
    </div>
  );
}
