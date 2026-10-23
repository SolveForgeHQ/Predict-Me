"use client";

import { useState, useEffect, useCallback } from "react";
import { Market } from "@/lib/markets";
import { outcomeColor, winningLabel } from "@/lib/types";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { parseTransactionError } from "@/lib/errors";
import { Loader2, Gift, RefreshCw } from "lucide-react";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "submitting" | "confirming";

export default function PositionCard({ market }: Props) {
  const { publicKey, connected, connect, isWrongNetwork, switchNetwork } = useWallet();
  const toast = useToast();
  const { client, chain, chainMetadata } = useChain();
  const outcomes = market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"];
  const [balances, setBalances] = useState<number[]>(outcomes.map(() => 0));
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);
  const [onChainMarket, setOnChainMarket] = useState<{
    status: string;
    outcomeIndex?: number;
    outcome?: string;
  } | null>(null);

  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const isPending = pendingStep !== null;

  const resolvedIndex =
    onChainMarket?.outcomeIndex ??
    market.resolvedOutcomeIndex ??
    (market.status === "resolved_yes" ? 0 : market.status === "resolved_no" ? 1 : undefined);
  const isResolved =
    market.status !== "open" || onChainMarket?.status === "resolved";
  const winnerLabel = isResolved
    ? (resolvedIndex !== undefined && outcomes[resolvedIndex]) ||
      winningLabel(market) ||
      onChainMarket?.outcome ||
      null
    : null;
  const winningShares =
    isResolved && resolvedIndex !== undefined ? (balances[resolvedIndex] ?? 0) : 0;
  const hasWinningPosition = isResolved && winningShares > 0;

  const getStepLabel = (step: PendingStep): string => {
    switch (step) {
      case "simulating": return `Simulating claim on ${chainMetadata.name}…`;
      case "signing":    return "Waiting for wallet signature…";
      case "submitting": return `Broadcasting claim to ${chainMetadata.name}…`;
      case "confirming": return "Waiting for block confirmation…";
    }
  };

  const loadPositionAndMarket = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalances(outcomes.map(() => 0));
      return;
    }
    setIsLoadingPosition(true);
    try {
      const [pos, mkt] = await Promise.all([
        client.getPosition(market.id, publicKey),
        client.getMarket(market.id).catch(() => null),
      ]);
      if (pos) {
        const b = (pos as any).balances as number[] | undefined;
        if (Array.isArray(b) && b.length > 0) {
          setBalances(b);
        } else {
          setBalances([pos.yesShares ?? 0, pos.noShares ?? 0]);
        }
      }
      if (mkt) {
        const idx = (mkt as any).resolvedOutcomeIndex as number | undefined;
        setOnChainMarket({
          status: mkt.status,
          outcomeIndex: idx,
          outcome: (mkt as any).resolvedOutcome,
        });
      }
    } catch (err) {
      console.warn("Failed to load position:", err);
    } finally {
      setIsLoadingPosition(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, market.id, client]);

  useEffect(() => {
    loadPositionAndMarket();
  }, [loadPositionAndMarket]);

  // Auto-refresh when TradePanel fires a buy event for this market
  useEffect(() => {
    function handleBuy(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.marketId === market.id) {
        loadPositionAndMarket();
      }
    }
    window.addEventListener("predict-me:buy", handleBuy);
    return () => window.removeEventListener("predict-me:buy", handleBuy);
  }, [market.id, loadPositionAndMarket]);

  const handleClaim = async () => {
    if (!connected || !publicKey || !hasWinningPosition || isPending) return;
    if (isWrongNetwork) { await switchNetwork(); return; }

    setErrorMsg("");
    setTxHash("");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));
      const t1 = setTimeout(() => setPendingStep("signing"), 300);
      const t2 = setTimeout(() => setPendingStep("submitting"), 1200);
      const t3 = setTimeout(() => setPendingStep("confirming"), 2500);

      const result = await client.claimWinnings({ marketId: market.id, callerAddress: publicKey });

      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setTxHash(result.txHash);
      const payoutText = result.data && result.data > 0
        ? `${result.data} ${chainMetadata.currency}`
        : `${winningShares} winning ${winnerLabel} shares`;
      toast.success("Winnings Claimed!", `Successfully claimed ${payoutText} on ${chainMetadata.name}.`);
      await loadPositionAndMarket();
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency: chainMetadata.currency, action: "claim" });
      setErrorMsg(message);
      toast.error("Claim Failed", message);
    } finally {
      setPendingStep(null);
    }
  };

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "linear-gradient(135deg, #161B26, #131820)", border: "1px solid #1E2435" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: "#F2F4F7" }}>Your Position</h2>
          {connected && (
            <button
              onClick={loadPositionAndMarket}
              disabled={isLoadingPosition}
              title="Refresh on-chain position"
              className="text-[#8B93A7] hover:text-[#F2F4F7] transition-colors p-1"
            >
              <RefreshCw size={13} className={isLoadingPosition ? "animate-spin text-[#00D084]" : ""} />
            </button>
          )}
        </div>
        {isResolved && winnerLabel && (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: `${outcomeColor(resolvedIndex ?? 0)}22`, color: outcomeColor(resolvedIndex ?? 0) }}
          >
            Resolved: {winnerLabel}
          </span>
        )}
      </div>

      {/* Share balances */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {outcomes.map((label, i) => {
          const color = outcomeColor(i);
          const bal = balances[i] ?? 0;
          const won = isResolved && resolvedIndex === i;
          return (
            <div
              key={`${label}-${i}`}
              className="rounded-xl p-3.5"
              style={{ backgroundColor: "#0B0E14", border: `1px solid ${won && bal > 0 ? `${color}88` : `${color}33`}` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold truncate" style={{ color }} title={label}>{label}</p>
                {won && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}22`, color }}>
                    WON
                  </span>
                )}
              </div>
              <p className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>
                {connected ? (isLoadingPosition ? "…" : bal) : 0}
              </p>
            </div>
          );
        })}
      </div>

      {/* Claim Winnings */}
      {connected && hasWinningPosition && (
        <div className="pt-3" style={{ borderTop: "1px solid #1E2435" }}>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span style={{ color: "#8B93A7" }}>Claimable:</span>
            <span className="font-bold" style={{ color: outcomeColor(resolvedIndex ?? 0) }}>
              {winningShares} Winning {winnerLabel} Shares
            </span>
          </div>
          {isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ backgroundColor: "#E84142" }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : (
            <button
              onClick={handleClaim}
              disabled={isPending}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50"
              style={{ backgroundColor: "#00D084", color: "#0B0E14", boxShadow: "0 0 24px rgba(0,208,132,0.35)" }}
            >
              {isPending ? (
                <><Loader2 size={15} className="animate-spin" />{getStepLabel(pendingStep!)}</>
              ) : (
                <><Gift size={16} strokeWidth={2.2} />Claim Winnings</>
              )}
            </button>
          )}
        </div>
      )}

      {isPending && (
        <div className="mt-3">
          <StatusBanner variant="pending" stepLabel={getStepLabel(pendingStep!)} />
        </div>
      )}
      {errorMsg && !isPending && (
        <div className="mt-3">
          <StatusBanner variant="error" title="Transaction Failed" message={errorMsg} />
        </div>
      )}
      {txHash && !isPending && (
        <div className="mt-3">
          <StatusBanner variant="success" title="Transaction confirmed!" txHash={txHash} explorerBaseUrl={chainMetadata.explorerBaseUrl} />
        </div>
      )}
      {!connected && (
        <StatusBanner variant="wallet_required" message="Connect your wallet to see your live on-chain positions." onAction={connect} actionLabel="Connect" />
      )}
      {connected && isResolved && !hasWinningPosition && !txHash && (
        <p className="text-xs text-center text-[#8B93A7]">No winning shares to claim for this market.</p>
      )}
      {connected && !isResolved && (
        <p className="text-xs text-center text-[#8B93A7]">Live on-chain balance. Winnings can be claimed after resolution.</p>
      )}
    </div>
  );
}
