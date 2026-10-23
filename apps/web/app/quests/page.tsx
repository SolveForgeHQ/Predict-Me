"use client";

import { Target, Crosshair, Flame, RefreshCw, BarChart2, Trophy, Gift, Clock } from "lucide-react";
import { useChain } from "@/context/ChainContext";

const QUESTS = [
  { Icon: Crosshair, title: "First Prediction",   desc: "Place your first YES or NO bet.", reward: "50 pts",   done: false },
  { Icon: Flame,     title: "Win 3 in a Row",     desc: "Win three consecutive markets.",  reward: "200 pts",  done: false },
  { Icon: RefreshCw, title: "Daily Spin",         desc: "Spin the wheel once today.",       reward: "10 pts",   done: false },
  { Icon: BarChart2, title: "High Volume Trader", desc: "Trade over $500 in a single day.", reward: "500 pts",  done: false },
  { Icon: Trophy,    title: "Top 10 Finish",      desc: "Reach the top 10 leaderboard.",   reward: "1000 pts", done: false },
];

export default function QuestsPage() {
  const { chain, chainMetadata } = useChain();

  if (chain === "avalanche") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Target size={22} color="#00D084" />
          <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>Quests</h1>
        </div>
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
          style={{ background: "linear-gradient(135deg, #161B26, #131820)", border: "1px solid #1E2435" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${chainMetadata.color}18`, border: `1px solid ${chainMetadata.color}33` }}
          >
            <Clock size={26} color={chainMetadata.color} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-lg font-extrabold mb-1" style={{ color: "#F2F4F7" }}>
              Coming soon for Avalanche
            </p>
            <p className="text-sm" style={{ color: "#8B93A7" }}>
              Quest tracking and rewards are live on Sonic Testnet. Avalanche
              quest support is planned once the chain integration matures.
            </p>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ backgroundColor: `${chainMetadata.color}18`, color: chainMetadata.color }}
          >
            Live on Sonic · Avalanche coming soon
          </span>
        </div>
      </div>
    );
  }

  // Sonic — show quests
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-2">
        <Target size={22} color="#00D084" />
        <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>Quests</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: "#8B93A7" }}>
        Complete quests to earn points and unlock rewards.
      </p>

      {/* Spin the wheel CTA */}
      <div
        className="rounded-2xl p-5 mb-5 flex items-center gap-4"
        style={{ background: "linear-gradient(135deg, #1a1200, #161B26)", border: "1px solid #F59E0B33" }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#F59E0B22", border: "1.5px solid #F59E0B44" }}
        >
          <Gift size={22} color="#F59E0B" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold" style={{ color: "#F2F4F7" }}>Spin the Wheel</p>
          <p className="text-xs" style={{ color: "#8B93A7" }}>Daily free spin — reset at midnight UTC</p>
        </div>
        <button
          className="text-sm font-bold px-4 py-2 rounded-full shrink-0"
          style={{ backgroundColor: "#F59E0B", color: "#0B0E14" }}
        >
          Spin
        </button>
      </div>

      {/* Quest list */}
      <div className="flex flex-col gap-3">
        {QUESTS.map(({ Icon, title, desc, reward, done }) => (
          <div
            key={title}
            className="rounded-xl px-4 py-3.5 flex items-center gap-3"
            style={{
              backgroundColor: "#161B26",
              border: `1px solid ${done ? "#00D08433" : "#1E2435"}`,
              opacity: done ? 0.6 : 1,
            }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#1E2435" }}>
              <Icon size={16} color="#8B93A7" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#F2F4F7" }}>{title}</p>
              <p className="text-xs" style={{ color: "#8B93A7" }}>{desc}</p>
            </div>
            <span
              className="text-xs font-bold px-2 py-1 rounded-full shrink-0"
              style={{ backgroundColor: "#00D08420", color: "#00D084" }}
            >
              {reward}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-center mt-6" style={{ color: "#8B93A7" }}>
        Quest progress is placeholder · Connect wallet to track real progress.
      </p>
    </div>
  );
}
