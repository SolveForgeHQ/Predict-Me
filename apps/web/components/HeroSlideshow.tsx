"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Flame,
  Zap,
  Gift,
  TrendingUp,
  Lightbulb,
  ChevronRight,
} from "lucide-react";

interface Slide {
  id: number;
  gradient: string;
  EyebrowIcon: React.ElementType;
  eyebrowColor: string;
  eyebrowLabel: string;
  title: string;
  subtitle: string;
  cta?: { label: string; href: string };
  visual: React.ReactNode;
}

function TeamVs({ aColor, bColor }: { aColor: string; bColor: string }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg"
        style={{ backgroundColor: aColor + "33", border: `2px solid ${aColor}`, color: aColor }}
      >
        A
      </div>
      <span className="text-sm font-black" style={{ color: "rgba(255,255,255,0.35)" }}>VS</span>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg"
        style={{ backgroundColor: bColor + "33", border: `2px solid ${bColor}`, color: bColor }}
      >
        B
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    id: 1,
    gradient: "linear-gradient(135deg, #0f1e12 0%, #0B0E14 50%, #1a0f0f 100%)",
    EyebrowIcon: Flame,
    eyebrowColor: "#FF4D5E",
    eyebrowLabel: "Featured Match",
    title: "Arsenal vs Man City",
    subtitle: "Who wins the Premier League title race?",
    cta: { label: "Predict Now", href: "/market/1" },
    visual: <TeamVs aColor="#EF4444" bColor="#3B82F6" />,
  },
  {
    id: 2,
    gradient: "linear-gradient(135deg, #0f1020 0%, #0B0E14 50%, #1a100f 100%)",
    EyebrowIcon: Zap,
    eyebrowColor: "#F59E0B",
    eyebrowLabel: "Live Market",
    title: "Real Madrid vs Barcelona",
    subtitle: "El Clásico — pick your side before kick-off",
    cta: { label: "View Odds", href: "/market/5" },
    visual: <TeamVs aColor="#ffffff" bColor="#3B82F6" />,
  },
  {
    id: 3,
    gradient: "linear-gradient(135deg, #130f20 0%, #0B0E14 50%, #1a1400 100%)",
    EyebrowIcon: Gift,
    eyebrowColor: "#A78BFA",
    eyebrowLabel: "Daily Promo",
    title: "Spin the Wheel",
    subtitle: "Daily spin for bonus predict-me credits. No purchase needed.",
    cta: { label: "Spin Now", href: "/quests" },
    visual: (
      <div className="flex flex-col items-center gap-2 select-none">
        <Gift size={52} color="#A78BFA" strokeWidth={1.4}
          style={{ filter: "drop-shadow(0 0 16px rgba(167,139,250,0.5))" }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#A78BFA" }}>
          Free daily
        </span>
      </div>
    ),
  },
  {
    id: 4,
    gradient: "linear-gradient(135deg, #0f1a15 0%, #0B0E14 50%, #1a0f14 100%)",
    EyebrowIcon: TrendingUp,
    eyebrowColor: "#F59E0B",
    eyebrowLabel: "Trending",
    title: "Will Bitcoin hit $150k?",
    subtitle: "$213k pool · 41% say YES · closes Dec 2026",
    cta: { label: "Trade", href: "/market/2" },
    visual: (
      <div className="flex flex-col items-center gap-2 select-none">
        <TrendingUp size={48} color="#F59E0B" strokeWidth={1.6}
          style={{ filter: "drop-shadow(0 0 16px rgba(245,158,11,0.5))" }} />
        <span className="text-xl font-black" style={{ color: "#F59E0B" }}>$150,000</span>
      </div>
    ),
  },
  {
    id: 5,
    gradient: "linear-gradient(135deg, #0d1520 0%, #0B0E14 50%, #0d1520 100%)",
    EyebrowIcon: Lightbulb,
    eyebrowColor: "#00D084",
    eyebrowLabel: "How it works",
    title: "Predict. Trade. Win.",
    subtitle: "Pick YES or NO on any market, buy shares, and claim your winnings on-chain.",
    cta: { label: "Browse Markets", href: "/" },
    visual: (
      <div className="flex gap-5 select-none items-center">
        <Lightbulb size={32} color="#00D084" strokeWidth={1.5} />
        <TrendingUp size={32} color="#F59E0B" strokeWidth={1.5} />
        <Gift size={32} color="#A78BFA" strokeWidth={1.5} />
      </div>
    ),
  },
];

export default function HeroSlideshow() {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDES.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(next, 4500);
    return () => clearInterval(timer);
  }, [paused, next]);

  const slide = SLIDES[current];
  const { EyebrowIcon } = slide;

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ borderRadius: "20px", height: "260px" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart === null) return;
        const diff = touchStart - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
        setTouchStart(null);
      }}
    >
      {/* Background */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{ background: slide.gradient }}
      />

      {/* Visual — right side */}
      <div
        className="absolute right-6 top-1/2 opacity-80"
        style={{ transform: "translateY(-50%)" }}
      >
        {slide.visual}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-center h-full px-6 sm:px-8 max-w-xs">
        <div className="flex items-center gap-1.5 mb-2">
          <EyebrowIcon size={12} color={slide.eyebrowColor} strokeWidth={2.5} />
          <p
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: slide.eyebrowColor }}
          >
            {slide.eyebrowLabel}
          </p>
        </div>
        <h2
          className="text-2xl sm:text-3xl font-extrabold leading-tight mb-2"
          style={{ color: "#F2F4F7", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
        >
          {slide.title}
        </h2>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: "#8B93A7" }}>
          {slide.subtitle}
        </p>
        {slide.cta && (
          <Link
            href={slide.cta.href}
            className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-full self-start transition-all duration-150"
            style={{ backgroundColor: "#00D084", color: "#0B0E14" }}
          >
            {slide.cta.label}
            <ChevronRight size={14} strokeWidth={2.5} />
          </Link>
        )}
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width:  i === current ? "20px" : "6px",
              height: "6px",
              backgroundColor: i === current ? "#00D084" : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
