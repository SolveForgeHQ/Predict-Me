import Link from "next/link";
import { Flame, Radio } from "lucide-react";

interface Outcome {
  label: string;
  abbr: string;
  percent: number;
  color: string;
}

const OUTCOMES: Outcome[] = [
  { label: "Arsenal",  abbr: "ARS", percent: 48, color: "#EF4444" },
  { label: "Draw",     abbr: "DRW", percent: 22, color: "#8B93A7" },
  { label: "Man City", abbr: "MCI", percent: 30, color: "#3B82F6" },
];

export default function MatchPrediction() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Flame size={12} color="#FF4D5E" strokeWidth={2.5} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#FF4D5E" }}>
              Featured Match
            </p>
          </div>
          <h3 className="text-base font-extrabold" style={{ color: "#F2F4F7" }}>
            Arsenal vs Man City
          </h3>
        </div>
        <span
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "#FF4D5E22", color: "#FF4D5E" }}
        >
          <Radio size={10} strokeWidth={2.5} />
          Live
        </span>
      </div>

      {/* Three outcome columns */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {OUTCOMES.map(({ label, abbr, percent, color }) => (
          <div
            key={label}
            className="rounded-xl p-3 sm:p-4 flex flex-col items-center gap-2 text-center"
            style={{
              backgroundColor: "#0B0E14",
              border: `1px solid ${color}33`,
            }}
          >
            {/* Team badge */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black"
              style={{
                backgroundColor: color + "22",
                border: `1.5px solid ${color}55`,
                color,
              }}
            >
              {abbr}
            </div>

            <p className="text-xs font-semibold" style={{ color: "#8B93A7" }}>{label}</p>

            <p
              className="text-xl sm:text-2xl font-extrabold"
              style={{ color, textShadow: `0 0 16px ${color}55` }}
            >
              {percent}%
            </p>

            {/* Mini bar */}
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "#1E2435" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: color }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link
        href="/market/1"
        className="block w-full text-center py-3 rounded-xl text-sm font-bold btn-yes"
      >
        Predict Now →
      </Link>
    </div>
  );
}
