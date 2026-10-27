"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { User, Trophy, TrendingUp, ExternalLink, RefreshCw, Target } from "lucide-react";
import { useChain } from "@/context/ChainContext";
import {
  fetchProfile,
  formatProfit,
  truncateWallet,
  explorerUrl,
  CHAIN_SYMBOL,
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_BG,
  type ProfileResponse,
  type PositionStatus,
} from "@/lib/profile";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ background: "#161B26", border: "1px solid #1E2435" }}>
      <div className="skeleton h-4 w-32 mb-3" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-3 w-16 mb-1.5" />
            <div className="skeleton h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl px-4 py-3 animate-pulse" style={{ background: "#161B26", border: "1px solid #1E2435" }}>
          <div className="flex items-center gap-3">
            <div className="skeleton h-4 w-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-48" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PositionStatus }) {
  return (
    <span
      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: STATUS_BG[status], color: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Stats header ──────────────────────────────────────────────────────────────

function StatsHeader({ data, chain }: { data: ProfileResponse; chain: string }) {
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  const { display, positive } = formatProfit(data.totals.net_profit, data.token_decimals, symbol);

  return (
    <div
      className="rounded-2xl p-5 mb-5"
      style={{ background: "linear-gradient(135deg, #161B26, #131820)", border: "1px solid #1E2435" }}
    >
      {/* Wallet address */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#1E2435" }}
        >
          <User size={16} color="#8B93A7" strokeWidth={1.5} />
        </div>
        <div>
          <a
            href={explorerUrl(chain, data.wallet)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-semibold hover:underline"
            style={{ color: "#F2F4F7" }}
          >
            {truncateWallet(data.wallet)}
            <ExternalLink size={11} color="#8B93A7" />
          </a>
          {data.totals.rank !== null && (
            <p className="text-xs mt-0.5" style={{ color: "#8B93A7" }}>
              Rank #{data.totals.rank} on leaderboard
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: "#8B93A7" }}>Net profit</p>
          <p className="text-lg font-extrabold" style={{ color: positive ? "#00D084" : "#FF4D5E" }}>
            {display}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: "#8B93A7" }}>Win rate</p>
          <p className="text-lg font-extrabold" style={{ color: "#F2F4F7" }}>
            {Math.round(data.totals.win_rate * 100)}%
          </p>
        </div>
        <div>
          <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: "#8B93A7" }}>Markets</p>
          <p className="text-lg font-extrabold" style={{ color: "#F2F4F7" }}>
            {data.totals.resolved_markets}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: "#8B93A7" }}>Wins</p>
          <p className="text-lg font-extrabold" style={{ color: "#F2F4F7" }}>
            {data.totals.wins}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ entry, chain, decimals }: {
  entry: ProfileResponse["history"][0];
  chain: string;
  decimals: number;
}) {
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  const { display: profitDisplay, positive } = formatProfit(entry.profit, decimals, symbol);
  const { display: stakeDisplay } = formatProfit(entry.stake, decimals, symbol);
  const explorerBase = chain === "avalanche"
    ? "https://testnet.snowtrace.io/tx"
    : chain === "sonic"
    ? "https://testnet.sonicscan.org/tx"
    : "https://stellar.expert/explorer/testnet/tx";
  const txUrl = entry.tx_hash ? `${explorerBase}/${entry.tx_hash}` : null;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row"
      style={{ background: "#111620", border: "1px solid #1E2435" }}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <StatusBadge status={entry.status as PositionStatus} />
        <div className="min-w-0">
          <Link
            href={`/market/${entry.market_id}`}
            className="text-sm font-semibold truncate block hover:underline"
            style={{ color: "#F2F4F7" }}
          >
            {entry.question}
          </Link>
          <p className="text-xs mt-0.5" style={{ color: "#8B93A7" }}>
            Backed: <span style={{ color: "#D0D5DD" }}>{entry.outcome_backed.join(", ")}</span>
            {" · "}Stake: <span style={{ color: "#D0D5DD" }}>{stakeDisplay.replace(/^[+-]/, "")}</span>
            {txUrl && (
              <>
                {" · "}
                <a href={txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline" style={{ color: "#8B93A7" }}>
                  tx <ExternalLink size={9} />
                </a>
              </>
            )}
          </p>
        </div>
      </div>
      {entry.status !== "open" && entry.status !== "cancelled_refunded" && (
        <span
          className="text-sm font-bold tabular-nums shrink-0"
          style={{ color: positive ? "#00D084" : "#FF4D5E" }}
        >
          {profitDisplay}
        </span>
      )}
    </div>
  );
}

// ── Open position row ─────────────────────────────────────────────────────────

function OpenPositionRow({ pos, chain, decimals }: {
  pos: ProfileResponse["open_positions"][0];
  chain: string;
  decimals: number;
}) {
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  const { display: stakeDisplay } = formatProfit(pos.stake, decimals, symbol);

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: "#111620", border: "1px solid #1E2435" }}
    >
      <StatusBadge status="open" />
      <div className="flex-1 min-w-0">
        <Link
          href={`/market/${pos.market_id}`}
          className="text-sm font-semibold truncate block hover:underline"
          style={{ color: "#F2F4F7" }}
        >
          {pos.question}
        </Link>
        <p className="text-xs mt-0.5" style={{ color: "#8B93A7" }}>
          Backed: <span style={{ color: "#D0D5DD" }}>{pos.outcome_backed.join(", ")}</span>
          {" · "}Stake: <span style={{ color: "#D0D5DD" }}>{stakeDisplay.replace(/^[+-]/, "")}</span>
        </p>
      </div>
    </div>
  );
}

// ── Empty / Error states ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="rounded-2xl p-10 flex flex-col items-center text-center gap-3"
      style={{ background: "#161B26", border: "1px solid #1E2435" }}
    >
      <Target size={32} color="#8B93A7" strokeWidth={1.5} />
      <p className="text-base font-semibold" style={{ color: "#F2F4F7" }}>No trading history</p>
      <p className="text-sm" style={{ color: "#8B93A7" }}>
        This wallet hasn&apos;t participated in any markets yet.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
      style={{ background: "#161B26", border: "1px solid #FF4D5E44" }}
    >
      <p className="text-sm" style={{ color: "#FF4D5E" }}>Failed to load profile</p>
      <p className="text-xs" style={{ color: "#8B93A7" }}>{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full"
        style={{ background: "#FF4D5E22", color: "#FF4D5E" }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

// ── Main ProfileView component ────────────────────────────────────────────────

interface Props {
  wallet: string;
}

export default function ProfileView({ wallet }: Props) {
  const { chain } = useChain();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchProfile(chain, wallet, LIMIT, offset);
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [chain, wallet, offset]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <TrendingUp size={22} color="#E84142" />
          <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>Profile</h1>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="p-1.5 rounded-lg transition-colors"
          style={{ background: "#161B26", border: "1px solid #1E2435", color: "#8B93A7" }}
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[#00D084]" : ""} />
        </button>
      </div>

      {/* Stats */}
      {loading && !data ? <SkeletonCard /> : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data ? (
        <>
          <StatsHeader data={data} chain={chain} />

          {/* Open positions */}
          {data.open_positions.length > 0 && (
            <div className="mb-5">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "#8B93A7" }}>
                Open Positions ({data.open_positions.length})
              </h2>
              <div className="flex flex-col gap-2">
                {data.open_positions.map((pos) => (
                  <OpenPositionRow key={pos.market_id} pos={pos} chain={chain} decimals={data.token_decimals} />
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "#8B93A7" }}>
              History
              {data.pagination.total > 0 && (
                <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#2A3347" }}>
                  ({data.pagination.total} total)
                </span>
              )}
            </h2>

            {loading ? <SkeletonRows /> : data.history.length === 0 && data.open_positions.length === 0 ? (
              <EmptyState />
            ) : data.history.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#8B93A7" }}>
                No resolved or cancelled markets yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.history.map((entry, i) => (
                  <HistoryRow key={`${entry.market_id}-${i}`} entry={entry} chain={chain} decimals={data.token_decimals} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {data.pagination.total > LIMIT && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  disabled={offset === 0}
                  className="text-xs font-semibold px-4 py-2 rounded-full disabled:opacity-40"
                  style={{ background: "#161B26", border: "1px solid #1E2435", color: "#8B93A7" }}
                >
                  ← Newer
                </button>
                <span className="text-xs" style={{ color: "#8B93A7" }}>
                  {offset + 1}–{Math.min(offset + LIMIT, data.pagination.total)} of {data.pagination.total}
                </span>
                <button
                  onClick={() => setOffset(offset + LIMIT)}
                  disabled={offset + LIMIT >= data.pagination.total}
                  className="text-xs font-semibold px-4 py-2 rounded-full disabled:opacity-40"
                  style={{ background: "#161B26", border: "1px solid #1E2435", color: "#8B93A7" }}
                >
                  Older →
                </button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
