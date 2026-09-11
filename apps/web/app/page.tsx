import MarketCard from "@/components/MarketCard";
import HeroSlideshow from "@/components/HeroSlideshow";
import MatchPrediction from "@/components/MatchPrediction";
import { loadAllMarkets } from "@/lib/markets";

export const revalidate = 15; // Revalidate dynamic markets cache every 15 seconds

export default async function HomePage() {
  const markets = await loadAllMarkets();

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-6">

      {/* ── Hero slideshow ───────────────────────────────────── */}
      <div className="mb-6">
        <HeroSlideshow />
      </div>

      {/* ── Featured match prediction ────────────────────────── */}
      <div className="mb-6">
        <MatchPrediction />
      </div>

      {/* ── All Markets section header ───────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-bold" style={{ color: "#F2F4F7" }}>
          All Markets
        </h2>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "#00D08420", color: "#00D084" }}
        >
          {markets.length} active
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "linear-gradient(90deg, #1E2435, transparent)" }}
        />
      </div>

      {/* ── Market grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {markets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}
