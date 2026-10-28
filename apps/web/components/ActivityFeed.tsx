"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  PlusCircle, TrendingUp, CheckCircle, XCircle, Gift, RotateCcw,
  ExternalLink, RefreshCw, Activity,
} from "lucide-react";
import { useChain } from "@/context/ChainContext";
import {
  fetchFeed, formatAmount, relativeTime, txExplorerUrl, feedSentence,
  type FeedItem, type FeedEventType,
} from "@/lib/feed";
import { truncateWallet } from "@/lib/leaderboard";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;   // 15 seconds
const MAX_POLLS_PER_MIN = 4;       // rate limit

// ── Icons ─────────────────────────────────────────────────────────────────────

const EVENT_ICON: Record<FeedEventType, React.ElementType> = {
  MarketCreated:   PlusCircle,
  SharesBought:    TrendingUp,
  MarketResolved:  CheckCircle,
  MarketCancelled: XCircle,
  WinningsClaimed: Gift,
  Refunded:        RotateCcw,
};

const EVENT_COLOR: Record<FeedEventType, string> = {
  MarketCreated:   "#8B5CF6",
  SharesBought:    "#E84142",
  MarketResolved:  "#00D084",
  MarketCancelled: "#F59E0B",
  WinningsClaimed: "#00D084",
  Refunded:        "#60A5FA",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 py-3 px-4 animate-pulse">
      <div className="skeleton w-7 h-7 rounded-full shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="skeleton h-3.5 w-48" />
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="skeleton h-3 w-12 shrink-0" />
    </div>
  );
}

// ── Single feed row ───────────────────────────────────────────────────────────

function FeedRow({ item, chain }: { item: FeedItem; chain: string }) {
  const Icon = EVENT_ICON[item.type] ?? Activity;
  const color = EVENT_COLOR[item.type] ?? "#8B93A7";
  const txUrl = txExplorerUrl(chain, item.tx_hash);
  const sentence = feedSentence(item, chain);

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b last:border-b-0"
      style={{ borderColor: "#1E2435" }}>
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon size={13} color={color} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug" style={{ color: "#D0D5DD" }}>
          {item.wallet ? (
            <Link
              href={`/profile/${item.wallet}`}
              className="font-semibold hover:underline"
              style={{ color: "#F2F4F7" }}
            >
              {truncateWallet(item.wallet)}
            </Link>
          ) : (
            <span className="font-semibold" style={{ color: "#F2F4F7" }}>System</span>
          )}{" "}
          {sentence}
          {" · "}
          <Link
            href={`/market/${item.market_id}`}
            className="hover:underline truncate"
            style={{ color: "#8B93A7" }}
          >
            {item.question.length > 40 ? item.question.slice(0, 40) + "…" : item.question}
          </Link>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px]" style={{ color: "#8B93A7" }}>
            {relativeTime(item.timestamp)}
          </span>
          {item.tx_hash && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] hover:underline"
              style={{ color: "#8B93A7" }}
            >
              tx <ExternalLink size={9} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** If provided, only show events for this market */
  marketId?: string;
  /** How many items to show initially */
  initialLimit?: number;
  /** Whether to show a "Load more" button */
  showLoadMore?: boolean;
  /** Compact header (for homepage widget) vs full header (for /activity page) */
  compact?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityFeed({
  marketId,
  initialLimit = 10,
  showLoadMore = false,
  compact = false,
}: Props) {
  const { chain } = useChain();

  const [items, setItems]         = useState<FeedItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [hasMore, setHasMore]     = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount]   = useState(0);   // items prepended since last visible

  // Rate-limit tracking
  const pollCountRef  = useRef(0);
  const pollWindowRef = useRef(Date.now());
  const newestCursorRef = useRef<string | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNewCount(0);
    try {
      const data = await fetchFeed({ chain, limit: initialLimit, market_id: marketId });
      setItems(data.items);
      setHasMore(data.has_more);
      setNextCursor(data.next_cursor);
      newestCursorRef.current = data.items[0]?.cursor ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [chain, initialLimit, marketId]);

  useEffect(() => { initialLoad(); }, [initialLoad]);

  // ── Polling for new items ───────────────────────────────────────────────────
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      // Pause while tab is hidden
      if (document.hidden) {
        timerId = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      // Rate limit: max 4 polls per minute
      const now = Date.now();
      if (now - pollWindowRef.current >= 60_000) {
        pollCountRef.current  = 0;
        pollWindowRef.current = now;
      }
      if (pollCountRef.current >= MAX_POLLS_PER_MIN) {
        timerId = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      pollCountRef.current++;

      try {
        // Fetch newest page (no cursor = newest first)
        const data = await fetchFeed({ chain, limit: initialLimit, market_id: marketId });
        if (data.items.length > 0) {
          const newestKnown = newestCursorRef.current;
          // Prepend items that are newer than what we already have
          const incoming = newestKnown
            ? data.items.filter((item) => {
                const [ib, il] = item.cursor.split(":").map(Number);
                const [nb, nl] = newestKnown.split(":").map(Number);
                return ib > nb || (ib === nb && il > nl);
              })
            : data.items;

          if (incoming.length > 0) {
            newestCursorRef.current = incoming[0].cursor;
            setItems((prev) => {
              // Deduplicate by cursor
              const existing = new Set(prev.map((i) => i.cursor));
              const fresh = incoming.filter((i) => !existing.has(i.cursor));
              if (fresh.length === 0) return prev;
              setNewCount((c) => c + fresh.length);
              return [...fresh, ...prev];
            });
          }
        }
      } catch {
        // Silent poll failure — keep showing existing items
      }
      timerId = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timerId = setTimeout(poll, POLL_INTERVAL_MS);
    return () => clearTimeout(timerId);
  }, [chain, initialLimit, marketId]);

  // ── Load more ───────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchFeed({
        chain, limit: 20, cursor: nextCursor, market_id: marketId,
      });
      setItems((prev) => {
        const existing = new Set(prev.map((i) => i.cursor));
        const fresh = data.items.filter((i) => !existing.has(i.cursor));
        return [...prev, ...fresh];
      });
      setHasMore(data.has_more);
      setNextCursor(data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [chain, nextCursor, loadingMore, marketId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const title = compact ? "Live Activity" : "Activity Feed";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={compact ? 16 : 18} color="#E84142" />
          <h2
            className={`font-bold ${compact ? "text-sm" : "text-base"}`}
            style={{ color: "#F2F4F7" }}
          >
            {title}
          </h2>
          {newCount > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#E8414222", color: "#E84142" }}
            >
              +{newCount} new
            </span>
          )}
        </div>
        <button
          onClick={() => { initialLoad(); setNewCount(0); }}
          disabled={loading}
          className="p-1 rounded transition-colors"
          style={{ color: "#8B93A7" }}
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[#00D084]" : ""} />
        </button>
      </div>

      {/* Error notice (keeps old items visible) */}
      {error && items.length > 0 && (
        <div
          className="rounded-xl px-3 py-2 mb-3 flex items-center justify-between text-xs"
          style={{ background: "#FF4D5E12", border: "1px solid #FF4D5E33", color: "#FF4D5E" }}
        >
          <span>Could not refresh — showing cached feed</span>
          <button onClick={initialLoad} className="underline ml-2">Retry</button>
        </div>
      )}

      {/* Feed card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "#161B26", border: "1px solid #1E2435" }}
      >
        {loading && items.length === 0 ? (
          <div>
            {Array.from({ length: compact ? 4 : 6 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : !loading && error && items.length === 0 ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <Activity size={28} color="#8B93A7" strokeWidth={1.5} />
            <p className="text-sm" style={{ color: "#FF4D5E" }}>Failed to load activity</p>
            <p className="text-xs" style={{ color: "#8B93A7" }}>{error}</p>
            <button
              onClick={initialLoad}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full"
              style={{ background: "#FF4D5E22", color: "#FF4D5E" }}
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 flex flex-col items-center text-center gap-2">
            <Activity size={28} color="#8B93A7" strokeWidth={1.5} />
            <p className="text-sm font-semibold" style={{ color: "#F2F4F7" }}>No activity yet</p>
            <p className="text-xs" style={{ color: "#8B93A7" }}>
              Events will appear here once trading begins.
            </p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <FeedRow key={item.cursor} item={item} chain={chain} />
            ))}

            {/* Load more */}
            {showLoadMore && hasMore && (
              <div className="p-3 border-t" style={{ borderColor: "#1E2435" }}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full text-xs font-semibold py-2 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "#1E2435", color: "#8B93A7" }}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}

            {/* Compact "see all" link */}
            {compact && (
              <div className="p-3 border-t text-center" style={{ borderColor: "#1E2435" }}>
                <Link
                  href="/activity"
                  className="text-xs font-semibold hover:underline"
                  style={{ color: "#8B93A7" }}
                >
                  See all activity →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
