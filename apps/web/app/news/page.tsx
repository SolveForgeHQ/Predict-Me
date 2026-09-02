import { Newspaper, Bitcoin, Trophy, Cpu, TrendingDown, ExternalLink } from "lucide-react";

const ARTICLES = [
  {
    tag: "Crypto",
    tagColor: "#F59E0B",
    TagIcon: Bitcoin,
    title: "Bitcoin eyes $150k as ETF inflows hit record highs",
    time: "2h ago",
    read: "3 min read",
    market: { label: "BTC to $150k?", href: "/market/2" },
  },
  {
    tag: "Sports",
    tagColor: "#3B82F6",
    TagIcon: Trophy,
    title: "Arsenal move top of the table after Man City draw",
    time: "4h ago",
    read: "2 min read",
    market: { label: "Arsenal vs Man City", href: "/market/1" },
  },
  {
    tag: "Tech",
    tagColor: "#06B6D4",
    TagIcon: Cpu,
    title: "OpenAI insiders say GPT-5 is months away from release",
    time: "6h ago",
    read: "4 min read",
    market: { label: "GPT-5 before Dec 2026?", href: "/market/4" },
  },
  {
    tag: "Finance",
    tagColor: "#8B5CF6",
    TagIcon: TrendingDown,
    title: "Fed signals possible September rate cut amid cooling inflation",
    time: "1d ago",
    read: "3 min read",
    market: { label: "Fed cut in Sep 2026?", href: "/market/3" },
  },
];

export default function NewsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Newspaper size={22} color="#8B93A7" />
        <h1 className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>News</h1>
      </div>

      <div className="flex flex-col gap-4">
        {ARTICLES.map(({ tag, tagColor, TagIcon, title, time, read, market }) => (
          <div
            key={title}
            className="rounded-2xl p-4 sm:p-5"
            style={{
              background: "linear-gradient(135deg, #161B26, #131820)",
              border: "1px solid #1E2435",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: tagColor + "22", color: tagColor }}
              >
                <TagIcon size={10} strokeWidth={2.5} />
                {tag}
              </span>
              <span className="text-xs" style={{ color: "#8B93A7" }}>
                {time} · {read}
              </span>
            </div>

            <p className="text-sm font-semibold leading-snug mb-3" style={{ color: "#F2F4F7" }}>
              {title}
            </p>

            <a
              href={market.href}
              className="inline-flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ color: "#00D084" }}
            >
              <ExternalLink size={11} strokeWidth={2.5} />
              Related market: {market.label}
            </a>
          </div>
        ))}
      </div>

      <p className="text-xs text-center mt-6" style={{ color: "#8B93A7" }}>
        News feed is placeholder · Live integration coming in v2.
      </p>
    </div>
  );
}
