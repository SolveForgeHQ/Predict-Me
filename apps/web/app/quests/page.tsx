import { Target, Crosshair, Flame, RefreshCw, BarChart2, Trophy, Gift } from "lucide-react";

const QUESTS = [
  { Icon: Crosshair, title: "First Prediction",   desc: "Place your first YES or NO bet.", reward: "50 pts",   done: false },
  { Icon: Flame,     title: "Win 3 in a Row",     desc: "Win three consecutive markets.",  reward: "200 pts",  done: false },
  { Icon: RefreshCw, title: "Daily Spin",         desc: "Spin the wheel once today.",       reward: "10 pts",   done: false },
  { Icon: BarChart2, title: "High Volume Trader", desc: "Trade over $500 in a single day.", reward: "500 pts",  done: false },
  { Icon: Trophy,    title: "Top 10 Finish",      desc: "Reach the top 10 leaderboard.",   reward: "1000 pts", done: false },
];

export default function QuestsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
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
        style={{
          background: "linear-gradient(135deg, #1a1200, #161B26)",
          border: "1px solid #F59E0B33",
        }}
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
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#1E2435" }}
            >
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
