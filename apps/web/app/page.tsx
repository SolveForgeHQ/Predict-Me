import HeroSlideshow from "@/components/HeroSlideshow";
import MatchPrediction from "@/components/MatchPrediction";
import MarketFeed from "@/components/MarketFeed";
import ActivityFeed from "@/components/ActivityFeed";

export default function HomePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-6">
      <div className="mb-6">
        <HeroSlideshow />
      </div>
      <div className="mb-6">
        <MatchPrediction />
      </div>
      <MarketFeed />
      <div className="mt-8">
        <ActivityFeed compact initialLimit={10} />
      </div>
    </div>
  );
}
