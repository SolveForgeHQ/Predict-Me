"use client";

/**
 * MarketFeed — client component that loads markets for the currently
 * selected chain. Re-fetches whenever the chain changes.
 */

import { useState, useEffect } from "react";
import { useChain } from "@/context/ChainContext";
import { loadMarketsWithSource } from "@/lib/markets";
import MarketCard from "@/components/MarketCard";
import StatusBanner from "@/components/StatusBanner";
import type { Market } from "@/lib/types";

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
      <div className="flex justify-between pt-2 mt-auto" style={{ borderTop: "1px solid #1E2435" }}>
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  );
}

export default function MarketFeed() {
  const { chain, chainMetadata } = useChain();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [source, setSource] = useState<"backend" | "chain" | "fallback" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMarkets([]);

    loadMarketsWithSource(chain).then(({ markets: m, source: s }) => {
      if (!cancelled) {
        setMarkets(m);
        setSource(s);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setMarkets([]);
        setSource("fallback");
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [chain]);

  return (
    <>
      {source === "chain" && <StatusBanner variant="backend_offline" />}

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-bold" style={{ color: "#F2F4F7" }}>
          {chainMetadata.name} Markets
        </h2>
        {!loading && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${chainMetadata.color}20`, color: chainMetadata.color }}
          >
            {markets.length} active
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #1E2435, transparent)" }} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : markets.length > 0
          ? markets.map((market) => <MarketCard key={`${chain}:${market.id}`} market={market} />)
          : (
            <div
              className="col-span-2 rounded-2xl p-8 text-center"
              style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
            >
              <p className="text-sm font-semibold mb-1" style={{ color: "#F2F4F7" }}>
                No markets on {chainMetadata.name} yet
              </p>
              <p className="text-xs" style={{ color: "#8B93A7" }}>
                Markets will appear here once they&apos;re created on-chain.
              </p>
            </div>
          )
        }
      </div>
    </>
  );
}
