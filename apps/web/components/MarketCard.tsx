import Link from "next/link";
import { Clock, Flame } from "lucide-react";
import { Market, formatPool, timeRemaining } from "@/lib/markets";

interface Props {
  market: Market;
}

const CATEGORY_COLORS: Record<string, string> = {
  Sports:  "#3B82F6",
  Crypto:  "#F59E0B",
  Finance: "#8B5CF6",
  Tech:    "#06B6D4",
  General: "#8B93A7",
};

function getLabel(market: Market): { Icon: React.ElementType; text: string; color: string } | null {
  const diff = new Date(market.endsAt).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (diff > 0 && hours <= 24) return { Icon: Clock, text: "Closing soon", color: "#F59E0B" };
  if (market.totalPool >= 200_000) return { Icon: Flame, text: "Trending",     color: "#FF4D5E" };
  return null;
}

export default function MarketCard({ market }: Props) {
  const categoryColor = CATEGORY_COLORS[market.category] ?? "#8B93A7";
  const label = getLabel(market);

  return (
    <Link href={`/market/${market.id}`} className="block">
      <div className="market-card rounded-2xl p-4 sm:p-5 flex flex-col gap-3 h-full">

        {/* Top row: category + label/status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: categoryColor + "22", color: categoryColor }}
          >
            {market.category}
          </span>

          {market.status !== "open" ? (
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{
                backgroundColor: market.status === "resolved_yes" ? "#00D08422" : "#FF4D5E22",
                color: market.status === "resolved_yes" ? "#00D084" : "#FF4D5E",
              }}
            >
              {market.status === "resolved_yes" ? "Resolved YES" : "Resolved NO"}
            </span>
          ) : label ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: label.color + "22", color: label.color }}
            >
              <label.Icon size={10} strokeWidth={2.5} />
              {label.text}
            </span>
          ) : null}
        </div>

        {/* Question */}
        <p
          className="text-sm sm:text-[15px] font-bold leading-snug flex-1"
          style={{ color: "#F2F4F7" }}
        >
          {market.question}
        </p>

        {/* YES / NO bar */}
        <div>
          <div className="flex justify-between text-xs font-bold mb-1.5">
            <span style={{ color: "#00D084" }}>YES {market.yesPercent}%</span>
            <span style={{ color: "#FF4D5E" }}>NO {market.noPercent}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#0B0E14" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${market.yesPercent}%`,
                background: "linear-gradient(90deg, #00D084, #00B574)",
              }}
            />
          </div>
        </div>

        {/* Meta */}
        <div
          className="flex items-center justify-between text-xs pt-2.5"
          style={{ color: "#8B93A7", borderTop: "1px solid #1E2435" }}
        >
          <span>
            Pool:{" "}
            <span className="font-semibold" style={{ color: "#F2F4F7" }}>
              {formatPool(market.totalPool)}
            </span>
          </span>
          <span>{timeRemaining(market.endsAt)}</span>
        </div>
      </div>
    </Link>
  );
}
