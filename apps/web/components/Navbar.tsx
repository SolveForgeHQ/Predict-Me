"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className="text-sm font-semibold transition-all duration-150 px-4 py-1.5 rounded-full"
        style={{
          color: active ? "#00D084" : "#8B93A7",
          backgroundColor: active ? "#00D08418" : "transparent",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="sticky top-0 z-50 flex justify-center px-4 pt-4 pb-2 pointer-events-none">
      <header
        className="pointer-events-auto w-full max-w-5xl h-14 flex items-center justify-between px-6 rounded-full"
        style={{
          background: "rgba(22,27,38,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-0 select-none">
          <span className="text-lg font-extrabold tracking-tight" style={{ color: "#00D084" }}>
            predict
          </span>
          <span className="text-lg font-extrabold tracking-tight" style={{ color: "#F2F4F7" }}>
            -me
          </span>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLink("/", "Markets")}
          {navLink("/admin", "Admin")}
        </nav>

        {/* Connect Wallet */}
        <button
          className="text-sm font-semibold px-4 py-2 rounded-full border transition-all duration-150"
          style={{
            borderColor: "#00D084",
            color: "#00D084",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.backgroundColor = "#00D08422";
            b.style.boxShadow = "0 0 16px #00D08450";
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.backgroundColor = "transparent";
            b.style.boxShadow = "none";
          }}
        >
          Connect Wallet
        </button>
      </header>
    </div>
  );
}
