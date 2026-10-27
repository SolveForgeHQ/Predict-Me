"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy, Medal, ExternalLink, RefreshCw, Info } from "lucide-react";
import { useChain } from "@/context/ChainContext";
import { useWallet } from "@/context/WalletContext";
import {
  fetchLeaderboard,
  fetchWalletStats,
  formatProfit,
  formatWinRate,
  truncateWallet,
  explorerUrl,
  CHAIN_SYMBOL,
  type LeaderboardRow,
  type LeaderboardResponse,
  type WalletStatsResponse,
} from "@/lib/leaderboard";

// ── Constants ─────────────────────────────────────────────────
const RANK_COLORS = ["#F59E0B", "#9CA3AF", "#CD7C2F"] as const;
const MIN_MARKETS = 5;
const PAGE_LIMIT = 50;

// ── Skeleton rows ─────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b" style={{ borderColor: "#1E2435" }}>
      <div className="skeleton w-5 h-4 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="skeleton h-3.5 w-32" />
        <div className="skeleton h-3 w-20" />
      </div>
      <div className="skeleton h-4 w-20 shrink-0" />
    </div>
  );
}

function SkeletonList() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

// ── Rank badge ────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <Medal
        size={18}
        strokeWidth={1.8}
        color={RANK_COLORS[rank - 1]}
        style={{ filter: `drop-shadow(0 0 5px ${RANK_COLORS[rank - 1]}66)`, flexShrink: 0 }}
      />
    );
  }
  return (
    <span className="w-5 text-center text-xs font-bold tabular-nums shrink-0" style={{ color: "#8B93A7" }}>
      #{rank}
    </span>
  );
}

// ── Leaderboard row ───────────────────────────────────────────
function LeaderRow({
  row,
  chain,
  isMe,
}: {
  row: LeaderboardRow;
  chain: string;
  isMe: boolean;
}) {
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  const { display, positive } = formatProfit(row.net_profit, row.token_decimals, symbol);
  const link = explorerUrl(chain, row.wallet);

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 border-b transition-colors"
      style={{
        borderColor: "#1E2435",
        background: isMe ? "rgba(0,208,132,0.07)" : "transparent",
        borderLeft: isMe ? "2px solid #00D084" : "2px solid transparent",
      }}
    >
      {/* Rank */}
      <div className="shrink-0 w-6 flex items-center justify-center">
        <RankBadge rank={row.rank} />
      </div>

      {/* Wallet + stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 group w-fit">
          <Link
            href={`/profile/${row.wallet}`}
            className="text-sm font-semibold truncate hover:underline"
            style={{ color: isMe ? "#00D084" : "#F2F4F7" }}
          >
            {truncateWallet(row.wallet)}
          </Link>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={11} style={{ color: "#8B93A7", flexShrink: 0 }} />
          </a>
        </div>
        <p className="text-xs mt-0.5" style={{ color: "#8B93A7" }}>
          {formatWinRate(row.win_rate)} wins · {row.resolved_markets} markets
        </p>
      </div>

      {/* Profit */}
      <span
        className="text-sm font-bold tabular-nums shrink-0"
        style={{ color: positive ? "#00D084" : "#FF4D5E" }}
      >
        {display}
      </span>
    </div>
  );
}

// ── "Your stats" card for wallet below threshold ─────────────
function YourStatsCard({
  stats,
  chain,
  isRanked,
}: {
  stats: WalletStatsResponse;
  chain: string;
  isRanked: boolean;
}) {
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  const { display, positive } = formatProfit(stats.net_profit, stats.token_decimals, symbol);

  if (isRanked) return null;

  return (
    <div
      className="rounded-2xl p-4 mb-5 border"
      style={{ background: "#161B26", borderColor: "#1E2435" }}
    >
      <p className="text-xs uppercase tracking-wider mb-3 font-semibold" style={{ color: "#8B93A7" }}>
        Your stats (unranked)
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="text-xs" style={{ color: "#8B93A7" }}>Net profit</p>
          <p className="text-sm font-bold" style={{ color: positive ? "#00D084" : "#FF4D5E" }}>
            {display}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "#8B93A7" }}>Resolved markets</p>
          <p className="text-sm font-bold" style={{ color: "#F2F4F7" }}>
            {stats.resolved_markets}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "#8B93A7" }}>Win rate</p>
          <p className="text-sm font-bold" style={{ color: "#F2F4F7" }}>
            {formatWinRate(stats.win_rate)}
          </p>
        </div>
      </div>
      {stats.markets_needed > 0 && (
        <div
          className="mt-3 rounded-xl px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: "#F59E0B18", color: "#F59E0B" }}
        >
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Complete <strong>{stats.markets_needed}</strong> more resolved market
            {stats.markets_needed !== 1 ? "s" : ""} to appear on the leaderboard.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState() {
  return (
    <div
      className="rounded-2xl p-10 flex flex-col items-center text-center gap-3"
      style={{ background: "#161B26", border: "1px solid #1E2435" }}
    >
      <Trophy size={32} color="#F59E0B" strokeWidth={1.5} />
      <p className="text-base font-semibold" style={{ color: "#F2F4F7" }}>
        No rankings yet
      </p>
      <p className="text-sm max-w-xs" style={{ color: "#8B93A7" }}>
        Be the first to finish {MIN_MARKETS} resolved markets and claim the top spot.
      </p>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
      style={{ background: "#161B26", border: "1px solid #FF4D5E44" }}
    >
      <p className="text-sm" style={{ color: "#FF4D5E" }}>
        Failed to load leaderboard
      </p>
      <p className="text-xs" style={{ color: "#8B93A7" }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-80"
        style={{ background: "#FF4D5E22", color: "#FF4D5E" }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

// ── How-it-works info box ─────────────────────────────────────
function HowItWorks() {
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs space-y-1"
      style={{ background: "#161B26", border: "1px solid #1E2435", color: "#8B93A7" }}
    >
      <p className="font-semibold" style={{ color: "#F2F4F7" }}>How ranking works</p>
      <ul className="space-y-0.5 list-disc list-inside">
        <li>Ranked by net profit on resolved markets (payout − stake).</li>
        <li>You need at least {MIN_MARKETS} resolved markets to appear here.</li>
        <li>Cancelled markets are excluded entirely.</li>
        <li>Profit is calculated on-chain even if you haven&apos;t claimed yet.</li>
      </ul>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
type Tab = "current" | "all";

export default function LeaderboardPage() {
  const { chain } = useChain();
  const { publicKey } = useWallet();

  const [tab, setTab] = useState<Tab>("current");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [myStats, setMyStats] = useState<WalletStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // The backend chain param for leaderboard — leaderboard only supported on sonic for now;
  // we pass the current chain so if more chains are indexed in future it just works.
  const backendChain = chain === "avalanche" ? "avalanche" : chain;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeaderboard({
        chain: backendChain,
        season: tab,
        limit: PAGE_LIMIT,
        offset: 0,
      });
      setLeaderboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [backendChain, tab]);

  // Load wallet stats separately (non-blocking)
  const loadMyStats = useCallback(async () => {
    if (!publicKey) {
      setMyStats(null);
      return;
    }
    setStatsLoading(true);
    try {
      const data = await fetchWalletStats(backendChain, publicKey);
      setMyStats(data);
    } catch {
      // Non-critical — silently ignore
      setMyStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [backendChain, publicKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMyStats(); }, [loadMyStats]);

  // Is connected wallet already on the ranked board?
  const myRankedRow = leaderboard?.rows.find(
    (r) => r.wallet.toLowerCase() === publicKey?.toLowerCase()
  );
  const showMyStatsCard =
    !statsLoading &&
    myStats !== null &&
    myStats.rank === null &&
    myStats.resolved_markets > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Trophy size={22} color="#F59E0B" />
        <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>
          Leaderboard
        </h1>
      </div>

      {/* Tabs */}
      <div
        className="flex rounded-xl p-1 mb-5 gap-1"
        style={{ background: "#161B26", border: "1px solid #1E2435" }}
      >
        {(["current", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
            style={
              tab === t
                ? { background: "#0B0E14", color: "#F2F4F7" }
                : { color: "#8B93A7" }
            }
          >
            {t === "current" ? "This week" : "All time"}
          </button>
        ))}
      </div>

      {/* My unranked stats card */}
      {showMyStatsCard && myStats && (
        <YourStatsCard stats={myStats} chain={backendChain} isRanked={false} />
      )}

      {/* Leaderboard card */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: "#161B26", border: "1px solid #1E2435" }}
      >
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : !leaderboard || leaderboard.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState />
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div
              className="flex items-center gap-3 py-2 px-4 border-b"
              style={{ borderColor: "#1E2435" }}
            >
              <span className="w-6 shrink-0" />
              <span className="flex-1 text-xs uppercase tracking-wider" style={{ color: "#8B93A7" }}>
                Wallet
              </span>
              <span className="text-xs uppercase tracking-wider shrink-0" style={{ color: "#8B93A7" }}>
                Net profit
              </span>
            </div>

            {/* Rows */}
            {leaderboard.rows.map((row) => (
              <LeaderRow
                key={row.wallet}
                row={row}
                chain={backendChain}
                isMe={row.wallet.toLowerCase() === publicKey?.toLowerCase()}
              />
            ))}

            {/* Footer: total count */}
            {leaderboard.total > PAGE_LIMIT && (
              <p
                className="text-xs text-center py-3"
                style={{ color: "#8B93A7" }}
              >
                Showing top {PAGE_LIMIT} of {leaderboard.total} traders
              </p>
            )}
          </div>
        )}
      </div>

      {/* Season window badge */}
      {leaderboard?.window && (
        <p className="text-xs text-center mb-4" style={{ color: "#8B93A7" }}>
          Week of {new Date(leaderboard.window.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          {" – "}
          {new Date(leaderboard.window.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}

      {/* How it works */}
      <HowItWorks />
    </div>
  );
}
