import Link from "next/link";
import { Clock, Flame } from "lucide-react";
import { Market, formatPool, timeRemaining } from "@/lib/markets";
import { outcomeColor, winningLabel } from "@/lib/types";

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
  const outcomes = market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"];
  const percents = market.outcomePercents.length === outcomes.length
    ? market.outcomePercents
    : outcomes.map(() => Math.round(100 / outcomes.length));
  const isBinary = outcomes.length === 2;
  const winner = winningLabel(market);
  const leaderIndex = percents.indexOf(Math.max(...percents));

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
                backgroundColor: `${outcomeColor(market.resolvedOutcomeIndex ?? 0)}22`,
                color: outcomeColor(market.resolvedOutcomeIndex ?? 0),
              }}
            >
              Resolved{winner ? `: ${winner}` : ""}
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

        {/* Outcome bar — N segments, never breaks layout */}
        <div>
          <div className="flex justify-between text-xs font-bold mb-1.5 gap-2">
            {isBinary ? (
              <>
                <span style={{ color: outcomeColor(0) }}>YES {percents[0]}%</span>
                <span style={{ color: outcomeColor(1) }}>NO {percents[1]}%</span>
              </>
            ) : (
              <>
                <span className="truncate" style={{ color: outcomeColor(leaderIndex) }}>
                  {outcomes[leaderIndex]} {percents[leaderIndex]}%
                </span>
                <span style={{ color: "#8B93A7" }}>{outcomes.length} outcomes</span>
              </>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: "#0B0E14" }}>
            {percents.map((p, i) => (
              <div
                key={i}
                className="h-full"
                style={{ width: `${p}%`, backgroundColor: outcomeColor(i) }}
                title={`${outcomes[i]} ${p}%`}
              />
            ))}
          </div>
          {!isBinary && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {outcomes.map((o, i) => (
                <span key={i} className="text-[11px] font-semibold" style={{ color: "#8B93A7" }}>
                  <span style={{ color: outcomeColor(i) }}>●</span> {o} {percents[i]}%
                </span>
              ))}
            </div>
          )}
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
