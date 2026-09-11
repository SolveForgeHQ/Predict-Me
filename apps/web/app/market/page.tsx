"use client";

import { useState, useEffect } from "react";
import MarketCard from "@/components/MarketCard";
import { Market, MARKETS, loadAllMarkets } from "@/lib/markets";
import { Search, TrendingUp, RefreshCw } from "lucide-react";

const CATEGORIES = ["All", "Crypto", "Sports", "Finance", "Tech"] as const;

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>(MARKETS);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const refreshMarkets = async () => {
    setIsLoading(true);
    try {
      const data = await loadAllMarkets();
      if (data && data.length > 0) {
        setMarkets(data);
      }
    } catch (err) {
      console.warn("Failed to load markets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshMarkets();
  }, []);

  const filteredMarkets = markets.filter((m) => {
    const matchesCategory =
      selectedCategory === "All" || m.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      m.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} color="#00D084" />
            <h1 className="text-xl font-extrabold" style={{ color: "#F2F4F7" }}>
              Explore Markets
            </h1>
          </div>
          <p className="text-xs" style={{ color: "#8B93A7" }}>
            Trade outcomes and predict the future on Stellar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshMarkets}
            disabled={isLoading}
            title="Refresh markets"
            className="p-1.5 rounded-lg bg-[#161B26] border border-[#1E2435] text-[#8B93A7] hover:text-[#F2F4F7] transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin text-[#00D084]" : ""} />
          </button>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "#00D08420", color: "#00D084" }}
          >
            {markets.length} live
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div
        className="flex items-center rounded-xl px-3.5 py-2.5 mb-4"
        style={{
          backgroundColor: "#161B26",
          border: "1px solid #1E2435",
        }}
      >
        <Search size={16} color="#8B93A7" className="shrink-0 mr-2.5" />
        <input
          type="text"
          placeholder="Search markets or categories…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-sm outline-none w-full"
          style={{ color: "#F2F4F7" }}
        />
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-1">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="text-xs font-bold px-3.5 py-1.5 rounded-full transition-all shrink-0"
              style={{
                backgroundColor: active ? "#00D084" : "#161B26",
                color: active ? "#0B0E14" : "#8B93A7",
                border: active ? "1px solid #00D084" : "1px solid #1E2435",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Markets Grid */}
      {filteredMarkets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {filteredMarkets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl p-8 text-center flex flex-col items-center justify-center my-6"
          style={{
            backgroundColor: "#161B26",
            border: "1px solid #1E2435",
          }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: "#F2F4F7" }}>
            No markets found
          </p>
          <p className="text-xs" style={{ color: "#8B93A7" }}>
            Try searching for another topic or selecting a different category.
          </p>
        </div>
      )}
    </div>
  );
}
