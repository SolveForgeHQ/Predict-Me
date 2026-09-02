"use client";

import { useState } from "react";
import { MARKETS, Market, formatPool, timeRemaining } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { Wallet, ShieldOff } from "lucide-react";

// Hardcoded owner address — replace with your real admin wallet public key
const ADMIN_ADDRESS =
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

export default function AdminPage() {
  const { publicKey, connected, connecting, connect } = useWallet();
  const [markets, setMarkets] = useState<Market[]>(MARKETS);
  const [question, setQuestion] = useState("");
  const [endDate, setEndDate] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isAdmin = connected && publicKey === ADMIN_ADDRESS;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !question.trim() || !endDate) return;
    const newMarket: Market = {
      id: String(Date.now()),
      question: question.trim(),
      yesPercent: 50,
      noPercent: 50,
      totalPool: 0,
      endsAt: new Date(endDate).toISOString(),
      status: "open",
      category: "General",
    };
    setMarkets((prev) => [newMarket, ...prev]);
    setQuestion("");
    setEndDate("");
    setSuccessMsg("Market created successfully.");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const resolve = (id: string, outcome: "resolved_yes" | "resolved_no") => {
    if (!isAdmin) return;
    setMarkets((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: outcome } : m))
    );
  };

  const openCount = markets.filter((m) => m.status === "open").length;
  const resolvedCount = markets.filter((m) => m.status !== "open").length;

  // ── Not connected ─────────────────────────────────────────
  if (!connected) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center gap-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
        >
          <Wallet size={28} color="#8B93A7" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "#F2F4F7" }}>
            Wallet required
          </h2>
          <p className="text-sm" style={{ color: "#8B93A7" }}>
            Connect your admin wallet to access market management.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={connecting}
          className="btn-yes px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
        >
          <Wallet size={15} strokeWidth={2} />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  // ── Connected but not admin ────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center gap-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "#1A0F14", border: "1px solid #FF4D5E33" }}
        >
          <ShieldOff size={28} color="#FF4D5E" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "#F2F4F7" }}>
            Access denied
          </h2>
          <p className="text-sm" style={{ color: "#8B93A7" }}>
            The connected wallet is not the admin address for this deployment.
          </p>
        </div>
        <p className="text-xs font-mono px-3 py-2 rounded-lg" style={{ backgroundColor: "#161B26", color: "#8B93A7" }}>
          {publicKey?.slice(0, 8)}…{publicKey?.slice(-6)}
        </p>
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #0D111A 0%, #0B0E14 100%)" }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

        {/* Header */}
        <div
          className="rounded-2xl px-6 py-5 mb-8 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #131820, #0F1520)", border: "1px solid #1E2435" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: "#F59E0B22", color: "#F59E0B", letterSpacing: "0.08em" }}
              >
                ADMIN
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#F2F4F7" }}>
              Market Management
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#8B93A7" }}>
              Create markets and resolve outcomes on-chain.
            </p>
          </div>
          <div className="hidden sm:flex gap-4 text-center">
            <div>
              <p className="text-xl font-extrabold" style={{ color: "#00D084" }}>{openCount}</p>
              <p className="text-xs" style={{ color: "#8B93A7" }}>Open</p>
            </div>
            <div style={{ borderLeft: "1px solid #1E2435", paddingLeft: "1rem" }}>
              <p className="text-xl font-extrabold" style={{ color: "#8B93A7" }}>{resolvedCount}</p>
              <p className="text-xs" style={{ color: "#8B93A7" }}>Resolved</p>
            </div>
          </div>
        </div>

        {/* Create form */}
        <div
          className="rounded-2xl p-6 mb-8"
          style={{ background: "linear-gradient(135deg, #131820, #0F1520)", border: "1px solid #1E2435" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: "#00D084" }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#F2F4F7" }}>
              Create New Market
            </h2>
          </div>

          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "#8B93A7" }}
              >
                Question
              </label>
              <input
                type="text"
                placeholder="e.g. Will BTC reach $200k in 2027?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
                className="w-full rounded-xl py-3 px-4 text-sm outline-none"
                style={{
                  backgroundColor: "#0B0E14",
                  border: "1px solid #1E2435",
                  color: "#F2F4F7",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00D08466")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#1E2435")}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "#8B93A7" }}
              >
                Resolution Date
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-xl py-3 px-4 text-sm outline-none"
                style={{
                  backgroundColor: "#0B0E14",
                  border: "1px solid #1E2435",
                  color: "#F2F4F7",
                  colorScheme: "dark",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00D08466")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#1E2435")}
              />
            </div>

            {successMsg && (
              <div
                className="rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2"
                style={{ backgroundColor: "#00D08418", color: "#00D084", border: "1px solid #00D08433" }}
              >
                <span>✓</span> {successMsg}
              </div>
            )}

            <button
              type="submit"
              className="btn-yes self-start px-6 py-2.5 rounded-xl text-sm font-bold"
            >
              + Create Market
            </button>
          </form>
        </div>

        {/* Market list */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full" style={{ backgroundColor: "#8B93A7" }} />
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#F2F4F7" }}>
            All Markets
          </h2>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "#1E2435", color: "#8B93A7" }}
          >
            {markets.length}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {markets.map((market) => (
            <div
              key={market.id}
              className="rounded-xl px-4 py-3.5"
              style={{
                background: "#111620",
                border: "1px solid #1E2435",
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.borderColor = "#2A3347")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.borderColor = "#1E2435")
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="inline-block text-xs font-bold px-2 py-0.5 rounded"
                      style={
                        market.status === "open"
                          ? { backgroundColor: "#00D08418", color: "#00D084" }
                          : market.status === "resolved_yes"
                          ? { backgroundColor: "#00D08418", color: "#00D084" }
                          : { backgroundColor: "#FF4D5E18", color: "#FF4D5E" }
                      }
                    >
                      {market.status === "open"
                        ? "OPEN"
                        : market.status === "resolved_yes"
                        ? "YES"
                        : "NO"}
                    </span>
                    <span className="text-xs" style={{ color: "#8B93A7" }}>
                      {formatPool(market.totalPool)} · {timeRemaining(market.endsAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: "#F2F4F7" }}>
                    {market.question}
                  </p>
                </div>

                {market.status === "open" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(market.id, "resolved_yes")}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                      style={{
                        backgroundColor: "#00D08422",
                        color: "#00D084",
                        border: "1px solid #00D08433",
                      }}
                    >
                      Resolve YES
                    </button>
                    <button
                      onClick={() => resolve(market.id, "resolved_no")}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                      style={{
                        backgroundColor: "#FF4D5E22",
                        color: "#FF4D5E",
                        border: "1px solid #FF4D5E33",
                      }}
                    >
                      Resolve NO
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
