"use client";

import { useState, useEffect } from "react";
import { MARKETS, Market, formatPool, timeRemaining } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { Wallet, ShieldOff, Loader2 } from "lucide-react";

// Describes which step of the on-chain flow we're in
type PendingStep =
  | "simulating"   // RPC simulation
  | "signing"      // Wallet prompt
  | "submitting"   // broadcast to network
  | "confirming";  // polling for ledger/block inclusion

const STEP_LABEL: Record<PendingStep, string> = {
  simulating:  "Simulating transaction…",
  signing:     "Waiting for wallet signature…",
  submitting:  "Broadcasting to network…",
  confirming:  "Waiting for block confirmation…",
};

interface ResolvingState {
  marketId: string;
  outcome: "YES" | "NO";
  step: PendingStep;
}

export default function AdminPage() {
  const { publicKey, connected, connecting, connect } = useWallet();
  const toast = useToast();
  const { chain, chainMetadata, client } = useChain();
  const [markets, setMarkets] = useState<Market[]>(MARKETS);

  // Form fields
  const [question, setQuestion] = useState("");
  const [endDate, setEndDate]   = useState("");
  const [category, setCategory] = useState("General");

  // Feedback for Create Market
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [txHash, setTxHash]           = useState("");

  // Feedback for Resolve Market
  const [resolvingState, setResolvingState] = useState<ResolvingState | null>(null);
  const [resolveError, setResolveError]     = useState<{ marketId: string; message: string } | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState<{ marketId: string; txHash: string; outcome: "YES" | "NO" } | null>(null);

  // On-chain owner state for Avalanche
  const [onChainOwner, setOnChainOwner] = useState<string | null>(null);
  const [isLoadingOwner, setIsLoadingOwner] = useState(false);

  const isAvalanche = chain === "avalanche";

  // Query contract owner when on Avalanche
  useEffect(() => {
    let cancelled = false;
    if (isAvalanche && client.getOwner) {
      setIsLoadingOwner(true);
      client.getOwner()
        .then((owner) => {
          if (!cancelled) setOnChainOwner(owner);
        })
        .catch((err) => {
          console.warn("Failed to get contract owner:", err);
          if (!cancelled) setOnChainOwner(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingOwner(false);
        });
    } else {
      setOnChainOwner(null);
      setIsLoadingOwner(false);
    }
    return () => {
      cancelled = true;
    };
  }, [isAvalanche, client]);

  // Environment fallback addresses
  const configuredAvalancheAdmin =
    process.env.NEXT_PUBLIC_AVALANCHE_ADMIN_ADDRESS ??
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const configuredStellarAdmin =
    process.env.NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS ??
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
    "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

  const expectedOwner = isAvalanche
    ? (onChainOwner ?? configuredAvalancheAdmin ?? null)
    : configuredStellarAdmin;

  const isAdmin = Boolean(
    connected &&
    publicKey &&
    (
      isAvalanche
        ? (
            (onChainOwner && publicKey.toLowerCase() === onChainOwner.toLowerCase()) ||
            (configuredAvalancheAdmin && publicKey.toLowerCase() === configuredAvalancheAdmin.toLowerCase())
          )
        : (publicKey === configuredStellarAdmin)
    )
  );

  const isPending = pendingStep !== null;
  const isResolving = resolvingState !== null;

  // ── Create market ──────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !question.trim() || !endDate || isPending || isResolving) return;

    setErrorMsg("");
    setTxHash("");

    const endTimestampSec = Math.floor(new Date(endDate).getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);

    if (endTimestampSec <= nowSec) {
      setErrorMsg("Resolution date must be in the future.");
      return;
    }

    try {
      setPendingStep("simulating");
      await new Promise((r) => setTimeout(r, 0));

      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const submittingTimer = setTimeout(() => setPendingStep("submitting"), 1200);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2500);

      const callPromise = client.createMarket({
        question: question.trim(),
        endTime: endTimestampSec,
        category,
        callerAddress: publicKey ?? undefined,
      });

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      toast.success(
        "Market Created!",
        `Market registered on-chain on ${chainMetadata.name}.`
      );
      setQuestion("");
      setEndDate("");
      setCategory("General");

      // Optimistically add to the local list so the admin sees it immediately
      const createdId = result.data ?? result.txHash;
      const newMarket: Market = {
        id: createdId,
        question: question.trim(),
        yesPercent: 50,
        noPercent: 50,
        totalPool: 0,
        endsAt: new Date(endDate).toISOString(),
        status: "open",
        category,
      };
      setMarkets((prev) => [newMarket, ...prev]);
    } catch (err) {
      let message = "Failed to create market.";
      if (err instanceof Error) {
        if (
          err.message.includes("User rejected") ||
          err.message.includes("User denied") ||
          err.message.includes("rejected in your wallet")
        ) {
          message = "Transaction was cancelled in your wallet.";
        } else if (
          err.message.includes("OwnableUnauthorizedAccount") ||
          err.message.includes("caller is not the owner")
        ) {
          message = "Access restricted: Only the contract owner can create markets on Avalanche.";
        } else if (err.message.includes("InvalidEndTime")) {
          message = "Resolution date must be in the future.";
        } else if (err.message.includes("EmptyQuestion")) {
          message = "Market question cannot be empty.";
        } else {
          message = err.message;
        }
      }
      setErrorMsg(message);
      toast.error("Market Creation Failed", message);
      console.error("[admin] createMarket error:", err);
    } finally {
      setPendingStep(null);
    }
  };

  // ── Resolve market ─────────────────────────────────────────
  const handleResolve = async (marketId: string, outcome: "YES" | "NO") => {
    if (!isAdmin || isResolving || isPending) return;

    setResolveError(null);
    setResolveSuccess(null);
    setResolvingState({ marketId, outcome, step: "simulating" });

    try {
      await new Promise((r) => setTimeout(r, 0));

      const signingTimer = setTimeout(() => {
        setResolvingState((prev) => prev ? { ...prev, step: "signing" } : null);
      }, 300);

      const submittingTimer = setTimeout(() => {
        setResolvingState((prev) => prev ? { ...prev, step: "submitting" } : null);
      }, 1200);

      const confirmingTimer = setTimeout(() => {
        setResolvingState((prev) => prev ? { ...prev, step: "confirming" } : null);
      }, 2500);

      const callPromise = client.resolveMarket({
        marketId,
        outcome: outcome.toLowerCase() as "yes" | "no",
        callerAddress: publicKey ?? undefined,
      });

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setResolveSuccess({ marketId, txHash: result.txHash, outcome });
      toast.success("Market Resolved!", `Market resolved ${outcome} on ${chainMetadata.name}.`);

      // Update market status in UI once confirmed on-chain
      const newStatus = outcome === "YES" ? "resolved_yes" : "resolved_no";
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? { ...m, status: newStatus } : m))
      );
    } catch (err) {
      let message = "Failed to resolve market.";
      if (err instanceof Error) {
        const raw = err.message;
        if (
          raw.includes("User rejected") ||
          raw.includes("User denied") ||
          raw.includes("rejected in your wallet") ||
          raw.includes("rejected in wallet")
        ) {
          message = "Resolution transaction was cancelled in your wallet.";
        } else if (
          raw.includes("OwnableUnauthorizedAccount") ||
          raw.includes("caller is not the owner")
        ) {
          message = "Access restricted: Only the contract owner can resolve markets on Avalanche.";
        } else if (raw.includes("MarketNotFound")) {
          message = "Market does not exist on the smart contract.";
        } else if (raw.includes("MarketNotOpen")) {
          message = "This market is not open or has already been resolved.";
        } else if (raw.includes("not configured")) {
          message = raw;
        } else if (raw.includes("WalletClient is required")) {
          message = `Please connect your ${chainMetadata.shortName} owner wallet to resolve markets.`;
        } else {
          message = raw;
        }
      }
      setResolveError({ marketId, message });
      toast.error("Resolution Failed", message);
      console.error("[admin] resolveMarket error:", err);
    } finally {
      setResolvingState(null);
    }
  };

  const openCount     = markets.filter((m) => m.status === "open").length;
  const resolvedCount = markets.filter((m) => m.status !== "open").length;

  // ── Not connected ────────────────────────────────────────
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
            Connect your admin wallet to access market management on {chainMetadata.name}.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={connecting}
          className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{ backgroundColor: chainMetadata.color, color: "#FFFFFF" }}
        >
          <Wallet size={15} strokeWidth={2} />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  // ── Checking owner loading state ─────────────────────────
  if (isLoadingOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center gap-3">
        <Loader2 size={24} className="animate-spin" style={{ color: chainMetadata.color }} />
        <p className="text-sm" style={{ color: "#8B93A7" }}>
          Verifying contract owner permissions on {chainMetadata.name}…
        </p>
      </div>
    );
  }

  // ── Connected but not admin ──────────────────────────────
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
            Access restricted to owner
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#8B93A7" }}>
            Only the contract owner can manage prediction markets on{" "}
            <span className="font-semibold" style={{ color: chainMetadata.color }}>
              {chainMetadata.name}
            </span>.
          </p>
        </div>

        <div
          className="w-full text-left p-3.5 rounded-xl flex flex-col gap-2 text-xs"
          style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
        >
          <div>
            <p className="text-[#8B93A7] mb-0.5 font-medium">Connected wallet:</p>
            <p className="font-mono text-[#F2F4F7] break-all">{publicKey}</p>
          </div>
          {expectedOwner && (
            <div className="pt-2 border-t border-[#1E2435]">
              <p className="text-[#8B93A7] mb-0.5 font-medium">Required contract owner:</p>
              <p className="font-mono text-[#F59E0B] break-all">{expectedOwner}</p>
            </div>
          )}
        </div>

        <button
          onClick={connect}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: chainMetadata.color, color: "#FFFFFF" }}
        >
          Connect Owner Wallet
        </button>
      </div>
    );
  }

  // ── Admin view ───────────────────────────────────────────
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
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1.5"
                style={{ backgroundColor: chainMetadata.badgeBg, color: chainMetadata.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: chainMetadata.color }} />
                {chainMetadata.name}
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
              <p className="text-xl font-extrabold" style={{ color: chainMetadata.color }}>{openCount}</p>
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
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: chainMetadata.color }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#F2F4F7" }}>
              Create New Market on {chainMetadata.shortName}
            </h2>
          </div>

          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {/* Question */}
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
                disabled={isPending || isResolving}
                className="w-full rounded-xl py-3 px-4 text-sm outline-none disabled:opacity-50"
                style={{
                  backgroundColor: "#0B0E14",
                  border: "1px solid #1E2435",
                  color: "#F2F4F7",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = chainMetadata.borderColor)}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#1E2435")}
              />
            </div>

            {/* Category */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "#8B93A7" }}
              >
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isPending || isResolving}
                className="w-full rounded-xl py-3 px-4 text-sm outline-none disabled:opacity-50"
                style={{
                  backgroundColor: "#0B0E14",
                  border: "1px solid #1E2435",
                  color: "#F2F4F7",
                  colorScheme: "dark",
                }}
              >
                {["General", "Crypto", "Sports", "Finance", "Politics", "Tech"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Resolution date */}
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
                disabled={isPending || isResolving}
                className="w-full rounded-xl py-3 px-4 text-sm outline-none disabled:opacity-50"
                style={{
                  backgroundColor: "#0B0E14",
                  border: "1px solid #1E2435",
                  color: "#F2F4F7",
                  colorScheme: "dark",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = chainMetadata.borderColor)}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#1E2435")}
              />
            </div>

            {/* Pending state */}
            {isPending && (
              <StatusBanner variant="pending" stepLabel={STEP_LABEL[pendingStep!]} />
            )}

            {/* Error */}
            {errorMsg && !isPending && (
              <StatusBanner variant="error" title="Creation Failed" message={errorMsg} />
            )}

            {/* Success */}
            {txHash && !isPending && (
              <StatusBanner
                variant="success"
                title="Market created on-chain!"
                txHash={txHash}
              />
            )}

            <button
              type="submit"
              disabled={isPending || isResolving}
              className="self-start px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg"
              style={{
                backgroundColor: chainMetadata.color,
                boxShadow: `0 0 16px ${chainMetadata.color}40`,
              }}
            >
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating on {chainMetadata.shortName}…
                </>
              ) : (
                `+ Create Market on ${chainMetadata.shortName}`
              )}
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

        <div className="flex flex-col gap-3">
          {markets.map((market) => {
            const isThisResolving = resolvingState?.marketId === market.id;
            const hasError = resolveError?.marketId === market.id;
            const hasSuccess = resolveSuccess?.marketId === market.id;

            return (
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
                          ? "YES (RESOLVED)"
                          : "NO (RESOLVED)"}
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
                    <div className="flex gap-2 shrink-0 items-center">
                      <button
                        onClick={() => handleResolve(market.id, "YES")}
                        disabled={isResolving || isPending}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: "#00D08422",
                          color: "#00D084",
                          border: "1px solid #00D08433",
                        }}
                      >
                        {isThisResolving && resolvingState?.outcome === "YES" ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            {resolvingState.step === "signing"
                              ? "Sign…"
                              : resolvingState.step === "submitting"
                              ? "Broadcasting…"
                              : resolvingState.step === "confirming"
                              ? "Confirming…"
                              : "Simulating…"}
                          </>
                        ) : (
                          "Resolve YES"
                        )}
                      </button>
                      <button
                        onClick={() => handleResolve(market.id, "NO")}
                        disabled={isResolving || isPending}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: "#FF4D5E22",
                          color: "#FF4D5E",
                          border: "1px solid #FF4D5E33",
                        }}
                      >
                        {isThisResolving && resolvingState?.outcome === "NO" ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            {resolvingState.step === "signing"
                              ? "Sign…"
                              : resolvingState.step === "submitting"
                              ? "Broadcasting…"
                              : resolvingState.step === "confirming"
                              ? "Confirming…"
                              : "Simulating…"}
                          </>
                        ) : (
                          "Resolve NO"
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Resolution error */}
                {hasError && (
                  <div className="mt-3">
                    <StatusBanner
                      variant="error"
                      title="Resolution Failed"
                      message={resolveError.message}
                    />
                  </div>
                )}

                {/* Resolution success */}
                {hasSuccess && (
                  <div className="mt-3">
                    <StatusBanner
                      variant="success"
                      title={`Market resolved ${resolveSuccess.outcome} on-chain!`}
                      txHash={resolveSuccess.txHash}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
