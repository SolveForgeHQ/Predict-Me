"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { outcomeColor } from "@/lib/types";

interface HistoryPoint {
  timestamp: number;
  pools: number[];
  totalPool: number;
  percents: number[];
}

interface Props {
  marketId: string;
  chain?: string;
  outcomes: string[];
  /** Refresh interval in ms. Default 30s. */
  refreshInterval?: number;
}

const BACKEND_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787")
    : (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787");

export default function PriceChart({ marketId, chain, outcomes, refreshInterval = 30_000 }: Props) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const url = chain
        ? `${BACKEND_URL}/markets/${marketId}/history?chain=${chain}`
        : `${BACKEND_URL}/markets/${marketId}/history`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { history: HistoryPoint[] };
      setHistory(data.history ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [marketId, chain]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchHistory, refreshInterval]);

  const isBinary = outcomes.length === 2;
  const width = 600;
  const height = 120;
  const paddingX = 8;
  const paddingY = 8;

  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  function buildPath(outcomeIndex: number): string {
    if (history.length < 2) return "";
    const points = history.map((pt, i) => {
      const x = paddingX + (i / (history.length - 1)) * chartW;
      const pct = pt.percents[outcomeIndex] ?? 50;
      const y = paddingY + ((100 - pct) / 100) * chartH;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  }

  function buildArea(outcomeIndex: number): string {
    if (history.length < 2) return "";
    const path = buildPath(outcomeIndex);
    const lastX = paddingX + chartW;
    const firstX = paddingX;
    const bottomY = paddingY + chartH;
    return `${path} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  }

  // ── No data yet ──────────────────────────────────────────────
  if (!loading && (error || history.length === 0)) {
    return (
      <div
        className="rounded-2xl p-6 flex flex-col items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #161B26, #131820)",
          border: "1px solid #1E2435",
          minHeight: "200px",
        }}
      >
        <svg width="100%" height="72" viewBox="0 0 300 72" preserveAspectRatio="none" className="mb-3 opacity-25">
          <path d="M0,55 C20,50 40,28 70,32 C100,36 120,18 150,22 C180,26 200,12 230,15 C260,18 280,24 300,18"
            fill="none" stroke="#00D084" strokeWidth="2" />
        </svg>
        <p className="text-sm font-medium" style={{ color: "#8B93A7" }}>Price history</p>
        <p className="text-xs mt-0.5" style={{ color: "#2A3347" }}>
          {error ? "Failed to load — will retry" : "Data appears here once trading begins"}
        </p>
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="rounded-2xl animate-pulse"
        style={{
          background: "#161B26",
          border: "1px solid #1E2435",
          minHeight: "200px",
        }}
      />
    );
  }

  // ── Chart ────────────────────────────────────────────────────
  const latest = history[history.length - 1];
  const earliest = history[0];
  const durationMs = latest.timestamp - earliest.timestamp;
  const durationLabel = durationMs < 60_000
    ? "< 1 min"
    : durationMs < 3_600_000
    ? `${Math.round(durationMs / 60_000)}m`
    : `${Math.round(durationMs / 3_600_000)}h`;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8B93A7" }}>
            Price history
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#2A3347" }}>
            {history.length} snapshots · last {durationLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          {outcomes.slice(0, isBinary ? 2 : 4).map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: outcomeColor(i) }}
              />
              <span className="text-[11px] font-semibold" style={{ color: "#8B93A7" }}>
                {label} {latest.percents[i] ?? 0}%
              </span>
            </div>
          ))}
          <button
            onClick={fetchHistory}
            title="Refresh chart"
            className="p-1 rounded text-[#8B93A7] hover:text-[#F2F4F7] transition-colors"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: "120px" }}
      >
        <defs>
          {outcomes.slice(0, isBinary ? 2 : 4).map((_, i) => (
            <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={outcomeColor(i)} stopOpacity="0.25" />
              <stop offset="100%" stopColor={outcomeColor(i)} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid lines at 25%, 50%, 75% */}
        {[25, 50, 75].map((pct) => {
          const y = paddingY + ((100 - pct) / 100) * chartH;
          return (
            <line
              key={pct}
              x1={paddingX}
              y1={y}
              x2={paddingX + chartW}
              y2={y}
              stroke="#1E2435"
              strokeWidth="1"
            />
          );
        })}

        {/* Area fills first (behind lines) */}
        {outcomes.slice(0, isBinary ? 2 : 4).map((_, i) => (
          <path
            key={`area-${i}`}
            d={buildArea(i)}
            fill={`url(#grad-${i})`}
          />
        ))}

        {/* Lines on top */}
        {outcomes.slice(0, isBinary ? 2 : 4).map((_, i) => (
          <path
            key={`line-${i}`}
            d={buildPath(i)}
            fill="none"
            stroke={outcomeColor(i)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Latest point dots */}
        {history.length > 0 && outcomes.slice(0, isBinary ? 2 : 4).map((_, i) => {
          const lastPt = history[history.length - 1];
          const x = paddingX + chartW;
          const pct = lastPt.percents[i] ?? 50;
          const y = paddingY + ((100 - pct) / 100) * chartH;
          return (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={3}
              fill={outcomeColor(i)}
              stroke="#131820"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {/* Y-axis labels */}
      <div className="flex justify-between text-[10px] mt-1" style={{ color: "#2A3347" }}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
