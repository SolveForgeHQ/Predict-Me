"use client";

import { useState, useEffect } from "react";
import { Market, formatPool, timeRemaining } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { parseTransactionError } from "@/lib/errors";
import { Wallet, ShieldOff, Loader2, XCircle } from "lucide-react";

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
  outcomeIndex: number;
  outcomeLabel: string;
  step: PendingStep;
}

export default function AdminPage() {
  const { publicKey, connected, connecting, connect, isWrongNetwork, switchNetwork } = useWallet();
  const toast = useToast();
  const { chain, chainMetadata, client } = useChain();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);

  // Load existing markets from the backend when the admin page mounts or chain changes
  useEffect(() => {
    let cancelled = false;
    async function fetchMarkets() {
      setIsLoadingMarkets(true);
      try {
        const { loadMarketsWithSource } = await import("@/lib/markets");
        const res = await loadMarketsWithSource(chain);
        if (!cancelled && res.markets.length > 0) {
          setMarkets(res.markets);
        }
      } catch {
        // Silently ignore — admin can still create new markets
      } finally {
        if (!cancelled) setIsLoadingMarkets(false);
      }
    }
    fetchMarkets();
    return () => { cancelled = true; };
  }, [chain]);

  // Form fields
  const [question, setQuestion] = useState("");
  const [endDate, setEndDate]   = useState("");
  const [category, setCategory] = useState("General");
  const [outcomeInputs, setOutcomeInputs] = useState<string[]>(["YES", "NO"]);
  const [resolutionCriteria, setResolutionCriteria] = useState("");

  // Feedback for Create Market
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [txHash, setTxHash]           = useState("");

  // Feedback for Resolve Market
  const [resolvingState, setResolvingState] = useState<ResolvingState | null>(null);
  const [resolveError, setResolveError]     = useState<{ marketId: string; message: string } | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState<{ marketId: string; txHash: string; outcomeIndex: number; outcomeLabel: string } | null>(null);

  // On-chain owner state for EVM chains (Avalanche & Sonic)
  const [onChainOwner, setOnChainOwner] = useState<string | null>(null);
  const [isLoadingOwner, setIsLoadingOwner] = useState(false);

  const isAvalanche = chain === "avalanche";
  const isSonic = false; // Sonic removed from UI
  const isEvm = isAvalanche;

  // Query contract owner when on an EVM chain (both Avalanche and Sonic have getOwner)
  useEffect(() => {
    let cancelled = false;
    if (isEvm && client.getOwner) {
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
  }, [isEvm, client]);

  // Environment fallback addresses
  const configuredEvmAdmin =
    process.env.NEXT_PUBLIC_AVALANCHE_ADMIN_ADDRESS ??
    process.env.NEXT_PUBLIC_SONIC_ADMIN_ADDRESS ??
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const configuredStellarAdmin =
    process.env.NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS ??
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
    "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

  const expectedOwner = isEvm
    ? (onChainOwner ?? configuredEvmAdmin ?? null)
    : configuredStellarAdmin;

  const isAdmin = Boolean(
    connected &&
    publicKey &&
    (
      isEvm
        ? (
            (onChainOwner && publicKey.toLowerCase() === onChainOwner.toLowerCase()) ||
            (configuredEvmAdmin && publicKey.toLowerCase() === configuredEvmAdmin.toLowerCase())
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

    const outcomes = outcomeInputs.map((o) => o.trim()).filter((o) => o.length > 0);
    if (outcomes.length < 2) {
      setErrorMsg("At least 2 outcomes are required.");
      return;
    }
    if (outcomes.length > 8) {
      setErrorMsg("Maximum 8 outcomes in the admin UI (contract supports up to 32).");
      return;
    }

    setErrorMsg("");
    setTxHash("");

    const endTimestampSec = Math.floor(new Date(endDate).getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);

    if (endTimestampSec <= nowSec) {
      setErrorMsg("Resolution date must be in the future.");
      return;
    }

    if (isWrongNetwork) {
      await switchNetwork();
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
        outcomes,
        resolutionCriteria: resolutionCriteria.trim() || undefined,
        callerAddress: publicKey ?? undefined,
      });

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      toast.success(
        "Market Created!",
        `Market with ${outcomes.length} outcomes registered on-chain on ${chainMetadata.name}.`
      );
      setQuestion("");
      setEndDate("");
      setCategory("General");
      setOutcomeInputs(["YES", "NO"]);
      setResolutionCriteria("");

      // Optimistically add to the local list so the admin sees it immediately
      const createdId = result.data ?? result.txHash;
      const n = outcomes.length;
      const even = Math.round(100 / n);
      const outcomePercents = Array.from({ length: n }, () => even);
      outcomePercents[n - 1] += 100 - outcomePercents.reduce((a, b) => a + b, 0);
      const newMarket: Market = {
        id: createdId,
        question: question.trim(),
        outcomes: [...outcomes],
        outcomePercents,
        outcomePools: outcomes.map(() => 0),
        yesPercent: n === 2 ? outcomePercents[0] : 50,
        noPercent: n === 2 ? outcomePercents[1] : 50,
        totalPool: 0,
        endsAt: new Date(endDate).toISOString(),
        status: "open",
        category,
      };
      setMarkets((prev) => [newMarket, ...prev]);
    } catch (err) {
      const message = parseTransactionError(err, {
        chain,
        currency: chainMetadata.currency,
        action: "create",
      });
      setErrorMsg(message);
      toast.error("Market Creation Failed", message);
      console.error("[admin] createMarket error:", err);
    } finally {
      setPendingStep(null);
    }
  };

  // ── Resolve market ─────────────────────────────────────────
  const handleResolve = async (marketId: string, outcomeIndex: number) => {
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }

    const target = markets.find((m) => m.id === marketId);
    const outcomeLabel = target?.outcomes[outcomeIndex] ?? `Outcome ${outcomeIndex + 1}`;
    setResolveError(null);
    setResolveSuccess(null);
    setResolvingState({ marketId, outcomeIndex, outcomeLabel, step: "simulating" });

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
        winningOutcomeIndex: outcomeIndex,
        callerAddress: publicKey ?? undefined,
      });

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setResolveSuccess({ marketId, txHash: result.txHash, outcomeIndex, outcomeLabel });
      toast.success("Market Resolved!", `Market resolved to ${outcomeLabel} on ${chainMetadata.name}.`);

      // Update market status in UI once confirmed on-chain
      setMarkets((prev) =>
        prev.map((m) => {
          if (m.id !== marketId) return m;
          const n = m.outcomes.length;
          const status = n === 2
            ? (outcomeIndex === 0 ? "resolved_yes" : "resolved_no")
            : "resolved";
          return { ...m, status, resolvedOutcomeIndex: outcomeIndex };
        })
      );
    } catch (err) {
      const message = parseTransactionError(err, {
        chain,
        currency: chainMetadata.currency,
        action: "resolve",
      });
      setResolveError({ marketId, message });
      toast.error("Resolution Failed", message);
      console.error("[admin] resolveMarket error:", err);
    } finally {
      setResolvingState(null);
    }
  };

  // ── Cancel market (Sonic only) ─────────────────────────────
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ marketId: string; message: string } | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<{ marketId: string; txHash: string } | null>(null);

  const handleCancel = async (marketId: string) => {
    if (!isSonic || isWrongNetwork) {
      if (isWrongNetwork) await switchNetwork();
      return;
    }

    const sonicClient = client as any;
    if (typeof sonicClient.cancelMarket !== "function") return;

    setCancelError(null);
    setCancelSuccess(null);
    setCancelingId(marketId);

    try {
      const result = await sonicClient.cancelMarket(marketId);
      setCancelSuccess({ marketId, txHash: result.txHash });
      toast.success("Market Cancelled!", `Market ${marketId} cancelled on ${chainMetadata.name}.`);
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? { ...m, status: "resolved" as any } : m))
      );
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency: chainMetadata.currency, action: "resolve" });
      setCancelError({ marketId, message });
      toast.error("Cancel Failed", message);
      console.error("[admin] cancelMarket error:", err);
    } finally {
      setCancelingId(null);
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

        {/* Wrong network alert */}
        {connected && isWrongNetwork && (
          <div className="mb-8">
            <StatusBanner
              variant="wrong_network"
              title="Wrong Network Connected"
              message={`Your wallet is connected to an unsupported network. Please switch to ${chainMetadata.name} to create and resolve markets.`}
              onAction={switchNetwork}
              actionLabel="Switch Network"
            />
          </div>
        )}

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

            {/* Outcomes (2–8) */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "#8B93A7" }}
              >
                Outcomes ({outcomeInputs.length})
              </label>
              <div className="flex flex-col gap-2">
                {outcomeInputs.map((value, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={i === 0 ? "e.g. YES" : i === 1 ? "e.g. NO" : `Outcome ${i + 1}`}
                      value={value}
                      onChange={(e) => {
                        const next = [...outcomeInputs];
                        next[i] = e.target.value;
                        setOutcomeInputs(next);
                      }}
                      disabled={isPending || isResolving}
                      className="flex-1 rounded-xl py-2.5 px-4 text-sm outline-none disabled:opacity-50"
                      style={{
                        backgroundColor: "#0B0E14",
                        border: "1px solid #1E2435",
                        color: "#F2F4F7",
                      }}
                    />
                    {outcomeInputs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOutcomeInputs(outcomeInputs.filter((_, j) => j !== i))}
                        disabled={isPending || isResolving}
                        className="px-3 rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{ backgroundColor: "#1E2435", color: "#FF4D5E" }}
                        title="Remove outcome"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {outcomeInputs.length < 8 && (
                <button
                  type="button"
                  onClick={() => setOutcomeInputs([...outcomeInputs, `Outcome ${outcomeInputs.length + 1}`])}
                  disabled={isPending || isResolving}
                  className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: "#1E2435", color: "#8B93A7" }}
                >
                  + Add outcome
                </button>
              )}
              <p className="text-[11px] mt-1.5" style={{ color: "#2A3347" }}>
                Binary markets use YES / NO. Add more for multi-outcome (e.g. candidates).
              </p>
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

            {/* Resolution criteria (Sonic requires this) */}
            {isSonic && (
              <div>
                <label
                  className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: "#8B93A7" }}
                >
                  Resolution Criteria
                </label>
                <textarea
                  placeholder="e.g. The market resolves YES if X happens before the close time, as verified by Y source."
                  value={resolutionCriteria}
                  onChange={(e) => setResolutionCriteria(e.target.value)}
                  required={isSonic}
                  disabled={isPending || isResolving}
                  rows={3}
                  className="w-full rounded-xl py-3 px-4 text-sm outline-none disabled:opacity-50 resize-none"
                  style={{
                    backgroundColor: "#0B0E14",
                    border: "1px solid #1E2435",
                    color: "#F2F4F7",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = chainMetadata.borderColor)}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1E2435")}
                />
                <p className="text-[11px] mt-1.5" style={{ color: "#2A3347" }}>
                  Required on Sonic. Describes how the outcome will be determined, for auditability.
                </p>
              </div>
            )}

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
                explorerBaseUrl={chainMetadata.explorerBaseUrl}
              />
            )}

            {isWrongNetwork ? (
              <button
                type="button"
                onClick={switchNetwork}
                className="self-start px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-opacity hover:opacity-90 text-white shadow-lg cursor-pointer"
                style={{
                  backgroundColor: "#E84142",
                  boxShadow: "0 0 16px rgba(232, 65, 66, 0.4)",
                }}
              >
                Switch to {chainMetadata.name}
              </button>
            ) : (
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
            )}
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
            {isLoadingMarkets ? "…" : markets.length}
          </span>
          {isLoadingMarkets && (
            <Loader2 size={13} className="animate-spin" style={{ color: "#8B93A7" }} />
          )}
        </div>

        {isLoadingMarkets && markets.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl h-16 animate-pulse"
                style={{ backgroundColor: "#111620", border: "1px solid #1E2435" }}
              />
            ))}
          </div>
        ) : (
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
                            : { backgroundColor: "#8B93A733", color: "#F2F4F7" }
                        }
                      >
                        {market.status === "open"
                          ? "OPEN"
                          : market.resolvedOutcomeIndex !== undefined && market.outcomes[market.resolvedOutcomeIndex]
                          ? `${market.outcomes[market.resolvedOutcomeIndex]} (RESOLVED)`
                          : market.status === "resolved_yes"
                          ? "YES (RESOLVED)"
                          : market.status === "resolved_no"
                          ? "NO (RESOLVED)"
                          : "RESOLVED"}
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
                    <div className="flex gap-2 shrink-0 items-center flex-wrap">
                      {(market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"]).map((label, i) => {
                        const resolvingThis = isThisResolving && resolvingState?.outcomeIndex === i;
                        const color = i % 2 === 0 ? "#00D084" : "#FF4D5E";
                        return (
                          <button
                            key={`${label}-${i}`}
                            onClick={() => handleResolve(market.id, i)}
                            disabled={isResolving || isPending || cancelingId === market.id}
                            title={`Resolve to ${label}`}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed max-w-40 truncate"
                            style={{
                              backgroundColor: `${color}22`,
                              color,
                              border: `1px solid ${color}33`,
                            }}
                          >
                            {resolvingThis ? (
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
                              `Resolve ${label}`
                            )}
                          </button>
                        );
                      })}
                      {/* Sonic: Cancel market button */}
                      {isSonic && (
                        <button
                          onClick={() => handleCancel(market.id)}
                          disabled={isResolving || isPending || cancelingId === market.id}
                          title="Cancel market (refunds all stakers)"
                          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: "rgba(245, 158, 11, 0.12)",
                            color: "#F59E0B",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          {cancelingId === market.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Cancelling…
                            </>
                          ) : (
                            <>
                              <XCircle size={12} />
                              Cancel
                            </>
                          )}
                        </button>
                      )}
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
                      title={`Market resolved to ${resolveSuccess.outcomeLabel} on-chain!`}
                      txHash={resolveSuccess.txHash}
                      explorerBaseUrl={chainMetadata.explorerBaseUrl}
                    />
                  </div>
                )}

                {/* Cancel error / success */}
                {cancelError?.marketId === market.id && (
                  <div className="mt-3">
                    <StatusBanner variant="error" title="Cancel Failed" message={cancelError.message} />
                  </div>
                )}
                {cancelSuccess?.marketId === market.id && (
                  <div className="mt-3">
                    <StatusBanner
                      variant="success"
                      title="Market cancelled on-chain!"
                      txHash={cancelSuccess.txHash}
                      explorerBaseUrl={chainMetadata.explorerBaseUrl}
                    />
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
