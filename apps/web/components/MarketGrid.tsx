// MarketGrid.tsx — renders market cards or a loading skeleton

import MarketCard from "@/components/MarketCard";
import { Market } from "@/lib/types";

interface Props {
  markets: Market[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3 h-full"
      style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
    >
      <div className="skeleton h-5 w-20 rounded-full" />
      <div className="skeleton h-4 w-full rounded-md" />
      <div className="skeleton h-4 w-3/4 rounded-md" />
      <div className="skeleton h-2 w-full rounded-full mt-1" />
      <div
        className="flex justify-between pt-2 mt-auto"
        style={{ borderTop: "1px solid #1E2435" }}
      >
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  );
}

export default function MarketGrid({ markets, loading = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "#8B93A7" }}>
        No markets found.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  );
}
