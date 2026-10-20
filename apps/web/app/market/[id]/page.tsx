import { notFound } from "next/navigation";
import Link from "next/link";
import { MARKETS, getMarket, formatPool, timeRemaining, loadMarketsWithSource, mapBackendMarket, type Market } from "@/lib/markets";
import { outcomeColor, winningLabel } from "@/lib/types";
import TradePanel from "./TradePanel";
import PositionCard from "@/components/PositionCard";

interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return MARKETS.map((m) => ({ id: m.id }));
}

// Allow on-demand rendering for IDs not in generateStaticParams (live chain markets)
export const dynamicParams = true;
// Revalidate every 15 seconds so live market data stays fresh
export const revalidate = 15;

const CATEGORY_COLORS: Record<string, string> = {
  Sports: "#3B82F6", Crypto: "#F59E0B", Finance: "#8B5CF6",
  Tech: "#06B6D4", General: "#8B93A7",
};

export default async function MarketPage({ params }: Props) {
  const { id } = await params;

  let market = undefined as Market | undefined;

  // 1. Try backend by id across all chains (authoritative source)
  try {
    const { apiFetch } = await import("@/lib/api");
    for (const chain of ["sonic", "avalanche", "stellar"]) {
      try {
        const data = await apiFetch<{ market?: any }>(`/markets/${id}?chain=${chain}`);
          if (data?.market) {
            market = mapBackendMarket(data.market);
            break;
          }
        } catch {
          // Try next chain
        }
      }
    } catch {
      // Backend unavailable — fall through to chain fallback
    }

  // 2. If still not found, try loading all live markets and find by id
  if (!market) {
    try {
      const { markets: liveMarkets } = await loadMarketsWithSource();
      market = liveMarkets.find((m) => m.id === id);
    } catch {
      // Nothing we can do
    }
  }

  // 3. Fall back to mock data as last resort
  if (!market) {
    market = getMarket(id);
  }

  if (!market) notFound();

  const outcomes = market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"];
  const percents = market.outcomePercents.length === outcomes.length
    ? market.outcomePercents
    : outcomes.map(() => Math.round(100 / outcomes.length));
  const pools = market.outcomePools && market.outcomePools.length === outcomes.length
    ? market.outcomePools
    : outcomes.map((_, i) => Math.round((market.totalPool * (percents[i] ?? 0)) / 100));
  const winner = winningLabel(market);
  const isBinary = outcomes.length === 2;

  const catColor = CATEGORY_COLORS[market.category] ?? "#8B93A7";

  // Status flags
  const endsAtMs = new Date(market.endsAt).getTime();
  const isPastCloseTime = Date.now() >= endsAtMs;
  const isClosed = isPastCloseTime && market.status === "open";
  const isCancelled = (market as any).status === "cancelled";
  const isResolved = market.status !== "open" && !isCancelled;

  // Status label for the stats bar
  let statusLabel = "Open";
  let statusColor = "#00D084";
  if (isCancelled) { statusLabel = "Cancelled"; statusColor = "#F59E0B"; }
  else if (isClosed) { statusLabel = "Closed"; statusColor = "#8B93A7"; }
  else if (isResolved) { statusLabel = winner ?? "Resolved"; statusColor = outcomeColor(market.resolvedOutcomeIndex ?? 0); }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm mb-10 transition-opacity hover:opacity-70"
        style={{ color: "#8B93A7" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All Markets
      </Link>

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="mb-10">
        <span
          className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-4"
          style={{ backgroundColor: catColor + "22", color: catColor }}
        >
          {market.category} · {outcomes.length} outcomes
        </span>

        {/* Large question — the page headline */}
        <h1
          className="text-2xl sm:text-4xl font-extrabold leading-tight mb-10"
          style={{
            color: "#F2F4F7",
            letterSpacing: "-0.02em",
            textShadow: "0 2px 24px rgba(0,0,0,0.5)",
          }}
        >
          {market.question}
        </h1>

        {/* ── Closed / Cancelled banners ───────────────────────── */}
        {isCancelled && (
          <div
            className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3 text-sm"
            style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}
          >
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-bold">Market Cancelled</p>
              <p className="text-xs opacity-80 mt-0.5">This market was cancelled. All stakers can claim a refund.</p>
            </div>
          </div>
        )}
        {isClosed && (
          <div
            className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3 text-sm"
            style={{ backgroundColor: "rgba(139,147,167,0.1)", border: "1px solid rgba(139,147,167,0.2)", color: "#8B93A7" }}
          >
            <span className="text-base">⏳</span>
            <div>
              <p className="font-bold">Market Closed — Awaiting Resolution</p>
              <p className="text-xs opacity-80 mt-0.5">Trading has ended. The admin will resolve the outcome shortly.</p>
            </div>
          </div>
        )}

        {/* ── ODDS BAR — N outcomes, wraps cleanly ────────────── */}
        <div
          className="rounded-3xl p-6 sm:p-8"
          style={{
            background: "linear-gradient(135deg, #161B26 0%, #1A2030 100%)",
            border: "1px solid #1E2435",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)",
          }}
        >
          {/* Percentage labels */}
          <div className={`grid gap-4 mb-4 ${isBinary ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            {outcomes.map((label, i) => {
              const color = outcomeColor(i);
              const won = market.status !== "open" && market.resolvedOutcomeIndex === i;
              return (
                <div key={`${label}-${i}`} className={isBinary && i === 1 ? "text-right" : ""}>
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-1 truncate"
                    style={{ color }}
                    title={label}
                  >
                    {label}{won ? " · WON" : ""}
                  </p>
                  <p
                    className="text-4xl sm:text-5xl font-extrabold"
                    style={{ color, textShadow: `0 0 32px ${color}80` }}
                  >
                    {percents[i]}%
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#8B93A7" }}>
                    Pool: <strong style={{ color: "#F2F4F7" }}>{formatPool(pools[i] ?? 0)}</strong>
                  </p>
                </div>
              );
            })}
          </div>

          {/* The stacked bar — N segments */}
          <div
            className="relative h-7 rounded-full overflow-hidden flex mb-2"
            style={{
              backgroundColor: "#0B0E14",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5)",
            }}
          >
            {percents.map((p, i) => (
              <div
                key={i}
                className="h-full transition-all duration-700"
                style={{ width: `${p}%`, backgroundColor: outcomeColor(i) }}
                title={`${outcomes[i]} ${p}%`}
              />
            ))}
          </div>
          {winner && (
            <p className="text-xs mt-2" style={{ color: "#8B93A7" }}>
              Resolved: <strong style={{ color: outcomeColor(market.resolvedOutcomeIndex ?? 0) }}>{winner}</strong>
            </p>
          )}
        </div>

        {/* ── Resolution criteria (Sonic markets) ─────────────── */}
        {(market as any).resolutionCriteria && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-xs"
            style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
          >
            <p className="font-semibold mb-1 uppercase tracking-wider" style={{ color: "#8B93A7" }}>
              Resolution Criteria
            </p>
            <p style={{ color: "#D0D5DD", lineHeight: 1.6 }}>{(market as any).resolutionCriteria}</p>
          </div>
        )}
      </div>

      {/* ── Two-column body ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* LEFT — chart placeholder + stats */}
        <div className="flex-1 flex flex-col gap-5">

          {/* Chart placeholder */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #161B26, #131820)",
              border: "1px solid #1E2435",
              minHeight: "200px",
            }}
          >
            <svg width="100%" height="72" viewBox="0 0 300 72"
              preserveAspectRatio="none" className="mb-3 opacity-50">
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D084" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#00D084" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,55 C20,50 40,28 70,32 C100,36 120,18 150,22
                       C180,26 200,12 230,15 C260,18 280,24 300,18"
                fill="none" stroke="#00D084" strokeWidth="2" />
              <path d="M0,55 C20,50 40,28 70,32 C100,36 120,18 150,22
                       C180,26 200,12 230,15 C260,18 280,24 300,18 L300,72 L0,72 Z"
                fill="url(#cg)" />
            </svg>
            <p className="text-sm font-medium" style={{ color: "#8B93A7" }}>Price history</p>
            <p className="text-xs mt-0.5" style={{ color: "#2A3347" }}>Coming soon</p>
          </div>

          {/* Market stats */}
          <div
            className="rounded-2xl p-5 grid grid-cols-3 gap-4"
            style={{
              background: "linear-gradient(135deg, #161B26, #131820)",
              border: "1px solid #1E2435",
            }}
          >
            <div>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "#8B93A7" }}>
                Total Pool
              </p>
              <p className="text-xl font-extrabold" style={{ color: "#F2F4F7" }}>
                {formatPool(market.totalPool)}
              </p>
            </div>
            <div style={{ borderLeft: "1px solid #1E2435", paddingLeft: "1rem" }}>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "#8B93A7" }}>
                Time Left
              </p>
              <p className="text-xl font-extrabold" style={{ color: "#F2F4F7" }}>
                {timeRemaining(market.endsAt)}
              </p>
            </div>
            <div style={{ borderLeft: "1px solid #1E2435", paddingLeft: "1rem" }}>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "#8B93A7" }}>
                Status
              </p>
              <p
                className="text-xl font-extrabold"
                style={{ color: statusColor }}
              >
                {statusLabel}
              </p>
            </div>
          </div>

          {/* Resolution criteria — shown for Sonic markets */}
          {(market as any).resolutionCriteria && (
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, #161B26, #131820)",
                border: "1px solid #1E2435",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#8B93A7" }}>
                Resolution Criteria
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#D0D5DD" }}>
                {(market as any).resolutionCriteria}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — sticky trade + position */}
        <div className="lg:w-80 xl:w-96 flex flex-col gap-5">
          <div className="lg:sticky lg:top-28 flex flex-col gap-5">
            {!isCancelled && !isClosed && <TradePanel market={market} />}
            <PositionCard market={market} />
          </div>
        </div>
      </div>
    </div>
  );
}
