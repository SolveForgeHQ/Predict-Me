import { Trophy, Medal } from "lucide-react";

const MOCK_LEADERS = [
  { rank: 1, name: "0xDegen",    profit: "+$4,820", win: "74%" },
  { rank: 2, name: "PredictPro", profit: "+$3,210", win: "68%" },
  { rank: 3, name: "Satoshi42",  profit: "+$2,940", win: "65%" },
  { rank: 4, name: "MoonBull",   profit: "+$1,770", win: "61%" },
  { rank: 5, name: "CryptoHawk", profit: "+$1,540", win: "59%" },
];

const RANK_COLORS = ["#F59E0B", "#9CA3AF", "#CD7C2F"];

export default function LeaderboardPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Trophy size={22} color="#F59E0B" />
        <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>
          Leaderboard
        </h1>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full ml-auto"
          style={{ backgroundColor: "#F59E0B22", color: "#F59E0B" }}
        >
          All time
        </span>
      </div>

      <div
        className="rounded-2xl p-5 mb-5"
        style={{
          background: "linear-gradient(135deg, #161B26, #131820)",
          border: "1px solid #1E2435",
        }}
      >
        <p className="text-xs uppercase tracking-wider mb-4" style={{ color: "#8B93A7" }}>
          Top Predictors
        </p>
        <div className="flex flex-col gap-3">
          {MOCK_LEADERS.map(({ rank, name, profit, win }) => (
            <div key={rank} className="flex items-center gap-3">
              {rank <= 3 ? (
                <Medal
                  size={20}
                  strokeWidth={1.8}
                  color={RANK_COLORS[rank - 1]}
                  style={{ filter: `drop-shadow(0 0 6px ${RANK_COLORS[rank - 1]}66)`, flexShrink: 0 }}
                />
              ) : (
                <span
                  className="w-5 text-center text-xs font-bold shrink-0"
                  style={{ color: "#8B93A7" }}
                >
                  #{rank}
                </span>
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "#F2F4F7" }}>{name}</p>
                <p className="text-xs" style={{ color: "#8B93A7" }}>{win} win rate</p>
              </div>
              <p className="text-sm font-bold" style={{ color: "#00D084" }}>{profit}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-center" style={{ color: "#8B93A7" }}>
        Full leaderboard coming in v2 · Connect wallet to see your rank.
      </p>
    </div>
  );
}
