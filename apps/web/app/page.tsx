import HeroSlideshow from "@/components/HeroSlideshow";
import MatchPrediction from "@/components/MatchPrediction";
import MarketFeed from "@/components/MarketFeed";

// Markets are loaded client-side in MarketFeed so they update when the
// user switches chains without a full page reload.
export default function HomePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-6">
      {/* Hero slideshow */}
      <div className="mb-6">
        <HeroSlideshow />
      </div>

      {/* Featured match prediction */}
      <div className="mb-6">
        <MatchPrediction />
      </div>

      {/* Chain-aware market feed */}
      <MarketFeed />
    </div>
  );
}
