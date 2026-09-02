"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, TrendingUp, Trophy, Target, Newspaper } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",            label: "Home",        Icon: Home       },
  { href: "/market",      label: "Markets",     Icon: TrendingUp },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy     },
  { href: "/quests",      label: "Quests",      Icon: Target     },
  { href: "/news",        label: "News",        Icon: Newspaper  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    /* Outer wrapper — fixed, centered, floating pill with bottom spacing */
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <nav
        className="w-full max-w-2xl flex items-center justify-around rounded-full"
        style={{
          background: "rgba(13,17,23,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
          height: "60px",
        }}
      >
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-150"
              style={{ color: active ? "#00D084" : "#8B93A7" }}
            >
              <Icon
                size={19}
                strokeWidth={active ? 2.5 : 1.8}
                style={{
                  filter: active
                    ? "drop-shadow(0 0 6px rgba(0,208,132,0.65))"
                    : "none",
                }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: active ? "#00D084" : "#8B93A7" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
