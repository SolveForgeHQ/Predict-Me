import { notFound } from "next/navigation";
import Link from "next/link";
import { MARKETS, getMarket, formatPool, timeRemaining } from "@/lib/markets";
import TradePanel from "./TradePanel";

interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return MARKETS.map((m) => ({ id: m.id }));
}

const CATEGORY_COLORS: Record<string, string> = {
  Sports: "#3B82F6", Crypto: "#F59E0B", Finance: "#8B5CF6",
  Tech: "#06B6D4", General: "#8B93A7",
};

export default async function MarketPage({ params }: Props) {
  const { id } = await params;
  const market = getMarket(id);
  if (!market) notFound();

  const catColor = CATEGORY_COLORS[market.category] ?? "#8B93A7";
  const yesPool = formatPool(Math.round((market.totalPool * market.yesPercent) / 100));
  const noPool  = formatPool(Math.round((market.totalPool * market.noPercent)  / 100));

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
          {market.category}
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

        {/* ── ODDS BAR — visual centrepiece ──────────────────── */}
        <div
          className="rounded-3xl p-6 sm:p-8"
          style={{
            background: "linear-gradient(135deg, #161B26 0%, #1A2030 100%)",
            border: "1px solid #1E2435",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)",
          }}
        >
          {/* Percentage labels */}
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#00D084" }}>
                YES
              </p>
              <p
                className="text-4xl sm:text-5xl font-extrabold"
                style={{ color: "#00D084", textShadow: "0 0 32px rgba(0,208,132,0.5)" }}
              >
                {market.yesPercent}%
              </p>
            </div>
            <div className="text-center px-4">
              <p className="text-xs" style={{ color: "#8B93A7" }}>vs</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#FF4D5E" }}>
                NO
              </p>
              <p
                className="text-4xl sm:text-5xl font-extrabold"
                style={{ color: "#FF4D5E", textShadow: "0 0 32px rgba(255,77,94,0.5)" }}
              >
                {market.noPercent}%
              </p>
            </div>
          </div>

          {/* The bar itself — tall and prominent */}
          <div
            className="relative h-7 rounded-full overflow-hidden flex mb-4"
            style={{
              backgroundColor: "#0B0E14",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${market.yesPercent}%`,
                background: "linear-gradient(90deg, #00D084, #00B574)",
                boxShadow: "2px 0 12px rgba(0,208,132,0.4)",
              }}
            />
            <div
              className="h-full flex-1"
              style={{
                background: "linear-gradient(90deg, #FF4D5E88, #FF4D5E)",
              }}
            />
          </div>

          {/* Pool sub-labels */}
          <div className="flex justify-between text-xs" style={{ color: "#8B93A7" }}>
            <span>
              Pool:{" "}
              <strong style={{ color: "#F2F4F7" }}>{yesPool}</strong>
            </span>
            <span>
              Pool:{" "}
              <strong style={{ color: "#F2F4F7" }}>{noPool}</strong>
            </span>
          </div>
        </div>
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
                style={{
                  color: market.status === "open" ? "#00D084" : "#FF4D5E",
                  textShadow: market.status === "open"
                    ? "0 0 16px rgba(0,208,132,0.4)"
                    : "0 0 16px rgba(255,77,94,0.4)",
                }}
              >
                {market.status === "open" ? "Open" : market.status === "resolved_yes" ? "YES" : "NO"}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — sticky trade + position */}
        <div className="lg:w-80 xl:w-96 flex flex-col gap-5">
          <div className="lg:sticky lg:top-28 flex flex-col gap-5">
            <TradePanel market={market} />

            {/* Position card */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, #161B26, #131820)",
                border: "1px solid #1E2435",
              }}
            >
              <h2 className="text-sm font-bold mb-4" style={{ color: "#F2F4F7" }}>
                Your Position
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-xl p-3.5"
                  style={{ backgroundColor: "#0B0E14", border: "1px solid #00D08433" }}
                >
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#00D084" }}>
                    YES Shares
                  </p>
                  <p className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>0</p>
                  <p className="text-xs mt-1" style={{ color: "#8B93A7" }}>Avg. price: —</p>
                </div>
                <div
                  className="rounded-xl p-3.5"
                  style={{ backgroundColor: "#0B0E14", border: "1px solid #FF4D5E33" }}
                >
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#FF4D5E" }}>
                    NO Shares
                  </p>
                  <p className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>0</p>
                  <p className="text-xs mt-1" style={{ color: "#8B93A7" }}>Avg. price: —</p>
                </div>
              </div>
              <p className="text-xs text-center mt-4" style={{ color: "#8B93A7" }}>
                Connect your wallet to see real positions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
