"use client";

import { useState, useEffect, useCallback } from "react";
import { Market } from "@/lib/markets";
import { outcomeColor, winningLabel } from "@/lib/types";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { parseTransactionError } from "@/lib/errors";
import { Loader2, Gift, RefreshCw, AlertCircle } from "lucide-react";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "submitting" | "confirming";

const STEP_LABEL: Record<PendingStep, string> = {
  simulating: "Simulating claim…",
  signing: "Waiting for wallet signature…",
  submitting: "Broadcasting transaction…",
  confirming: "Confirming on ledger…",
};

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
  const [pendingAction, setPendingAction] = useState<"claim" | "refund" | "cancel">("claim");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const isPending = pendingStep !== null;
  const isSonic = chain === "sonic";

  // Sonic cancellation: check if market is cancelled
  const isCancelled =
    isSonic &&
    (onChainMarket?.status === "cancelled" ||
     (market as any).status === "cancelled");
  const hasStake = balances.some((b) => b > 0);

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
      case "simulating":
        return `Simulating claim on ${chainMetadata.name}…`;
      case "signing":
        return "Waiting for wallet signature…";
      case "submitting":
        return `Broadcasting claim to ${chainMetadata.name}…`;
      case "confirming":
        return chain === "avalanche"
          ? "Waiting for block confirmation on Avalanche…"
          : "Confirming on Stellar ledger…";
    }
  };

  // ── Load live position & market state from contract via the active chain client ───
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

  // ── Claim winnings via the active chain client ─────────────────────
  const handleClaim = async () => {
    if (!connected || !publicKey || !hasWinningPosition || isPending) return;

    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingAction("claim");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));

      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const submittingTimer = setTimeout(() => setPendingStep("submitting"), 1200);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2500);

      const callPromise = client.claimWinnings({
        marketId: market.id,
        callerAddress: publicKey,
      });

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      const payoutText =
        result.data && result.data > 0
          ? `${result.data} ${chainMetadata.currency}`
          : `${winningShares} winning ${winnerLabel} shares`;

      toast.success(
        "Winnings Claimed!",
        `Successfully claimed ${payoutText} on ${chainMetadata.name}.`
      );

      // Refresh on-chain balance after claim
      await loadPositionAndMarket();
    } catch (err) {
      const message = parseTransactionError(err, {
        chain,
        currency: chainMetadata.currency,
        action: "claim",
      });
      setErrorMsg(message);
      toast.error("Claim Failed", message);
      console.error("[PositionCard] claimWinnings error:", err);
    } finally {
      setPendingStep(null);
      setPendingAction("claim");
    }
  };

  // ── Sonic: Refund from cancelled market ────────────────────────
  const handleRefund = async () => {
    if (!connected || !publicKey || !isSonic || isPending) return;
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }

    const sonicClient = client as any;
    if (typeof sonicClient.refund !== "function") return;

    setErrorMsg("");
    setTxHash("");
    setPendingAction("refund");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));
      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const submittingTimer = setTimeout(() => setPendingStep("submitting"), 1200);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2500);

      const callPromise = sonicClient.refund(market.id);
      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      const refundText =
        result.data && result.data > 0
          ? `${result.data} ${chainMetadata.currency}`
          : "stake refunded";
      toast.success("Refund Claimed!", `Successfully refunded ${refundText} on ${chainMetadata.name}.`);
      await loadPositionAndMarket();
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency: chainMetadata.currency, action: "claim" });
      setErrorMsg(message);
      toast.error("Refund Failed", message);
      console.error("[PositionCard] refund error:", err);
    } finally {
      setPendingStep(null);
      setPendingAction("claim");
    }
  };

  // ── Sonic: Cancel unresolved market (after grace period) ─────────
  const handleCancelUnresolved = async () => {
    if (!connected || !publicKey || !isSonic || isPending) return;
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }

    const sonicClient = client as any;
    if (typeof sonicClient.cancelUnresolved !== "function") return;

    setErrorMsg("");
    setTxHash("");
    setPendingAction("cancel");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));
      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const submittingTimer = setTimeout(() => setPendingStep("submitting"), 1200);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2500);

      const callPromise = sonicClient.cancelUnresolved(market.id);
      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(submittingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      toast.success("Market Cancelled!", `Market ${market.id} has been cancelled. Stakers can now refund.`);
      await loadPositionAndMarket();
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency: chainMetadata.currency, action: "resolve" });
      setErrorMsg(message);
      toast.error("Cancel Failed", message);
      console.error("[PositionCard] cancelUnresolved error:", err);
    } finally {
      setPendingStep(null);
      setPendingAction("claim");
    }
  };

  // ── Check if cancel-unresolved is available (closeTime + grace period passed) ──
  const endsAtMs = new Date(market.endsAt).getTime();
  const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches contract resolutionGracePeriod
  const isPastGracePeriod = Date.now() >= endsAtMs + GRACE_PERIOD_MS;
  const canCancelUnresolved =
    isSonic && isPastGracePeriod && market.status === "open" && connected;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: "#F2F4F7" }}>
            Your Position
          </h2>
          {connected && (
            <button
              onClick={loadPositionAndMarket}
              disabled={isLoadingPosition}
              title="Refresh on-chain position"
              className="text-[#8B93A7] hover:text-[#F2F4F7] transition-colors p-1"
            >
              <RefreshCw
                size={13}
                className={isLoadingPosition ? "animate-spin text-[#00D084]" : ""}
              />
            </button>
          )}
        </div>

        {isResolved && winnerLabel && (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${outcomeColor(resolvedIndex ?? 0)}22`,
              color: outcomeColor(resolvedIndex ?? 0),
            }}
          >
            Resolved: {winnerLabel}
          </span>
        )}
      </div>

      {/* Share balances — grid adapts to N outcomes */}
      <div className={`grid gap-3 mb-4 ${outcomes.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
        {outcomes.map((label, i) => {
          const color = outcomeColor(i);
          const bal = balances[i] ?? 0;
          const won = isResolved && resolvedIndex === i;
          return (
            <div
              key={`${label}-${i}`}
              className="rounded-xl p-3.5"
              style={{
                backgroundColor: "#0B0E14",
                border: `1px solid ${won && bal > 0 ? `${color}88` : `${color}33`}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold truncate" style={{ color }} title={label}>
                  {label}
                </p>
                {won && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
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

      {/* Claim Winnings Section */}
      {connected && hasWinningPosition && !isCancelled && (
        <div className="pt-3" style={{ borderTop: "1px solid #1E2435" }}>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span style={{ color: "#8B93A7" }}>Claimable Outcome:</span>
            <span className="font-bold" style={{ color: outcomeColor(resolvedIndex ?? 0) }}>
              {winningShares} Winning {winnerLabel} Shares
            </span>
          </div>

          {/* Wrong network alert for claiming */}
          {isWrongNetwork && !isPending && (
            <div className="mb-3">
              <StatusBanner
                variant="wrong_network"
                title="Wrong Network"
                message={`Your wallet is connected to an unsupported network. Please switch to ${chainMetadata.name} to claim winnings.`}
                onAction={switchNetwork}
                actionLabel="Switch Network"
              />
            </div>
          )}

          {isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg text-white cursor-pointer"
              style={{
                backgroundColor: "#E84142",
                boxShadow: "0 0 24px rgba(232,65,66,0.35)",
              }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : (
            <button
              onClick={handleClaim}
              disabled={isPending}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
              style={{
                backgroundColor: "#00D084",
                color: "#0B0E14",
                boxShadow: "0 0 24px rgba(0,208,132,0.35)",
              }}
            >
              {isPending && pendingAction === "claim" ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {getStepLabel(pendingStep!)}
                </>
              ) : (
                <>
                  <Gift size={16} strokeWidth={2.2} />
                  Claim Winnings
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Sonic: Cancelled market refund ───────────────────────── */}
      {connected && isCancelled && hasStake && (
        <div className="pt-3" style={{ borderTop: "1px solid #1E2435" }}>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span style={{ color: "#8B93A7" }}>Market Cancelled:</span>
            <span className="font-bold" style={{ color: "#F59E0B" }}>
              Refund available
            </span>
          </div>

          {isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg text-white cursor-pointer"
              style={{ backgroundColor: "#E84142" }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : (
            <button
              onClick={handleRefund}
              disabled={isPending}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
              style={{ backgroundColor: "#F59E0B", color: "#0B0E14" }}
            >
              {isPending && pendingAction === "refund" ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {getStepLabel(pendingStep!)}
                </>
              ) : (
                <>
                  <RefreshCw size={16} strokeWidth={2.2} />
                  Refund My Stake
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Sonic: Cancel unresolved market (after grace period) ── */}
      {connected && canCancelUnresolved && (
        <div className="pt-3" style={{ borderTop: "1px solid #1E2435" }}>
          <p className="text-xs mb-2" style={{ color: "#F59E0B" }}>
            This market&apos;s close time has passed but it hasn&apos;t been resolved.
            After the grace period, anyone can cancel it to unlock refunds.
          </p>
          {isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ backgroundColor: "#E84142" }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : (
            <button
              onClick={handleCancelUnresolved}
              disabled={isPending}
              className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
              style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.4)", color: "#F59E0B" }}
            >
              {isPending && pendingAction === "cancel" ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  {getStepLabel(pendingStep!)}
                </>
              ) : (
                <>
                  <AlertCircle size={13} />
                  Cancel unresolved market
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Pending status banner */}
      {isPending && (
        <div className="mt-3">
          <StatusBanner variant="pending" stepLabel={getStepLabel(pendingStep!)} />
        </div>
      )}

      {/* Inline claim error */}
      {errorMsg && !isPending && (
        <div className="mt-3">
          <StatusBanner variant="error" title="Transaction Failed" message={errorMsg} />
        </div>
      )}

      {/* Inline claim success */}
      {txHash && !isPending && (
        <div className="mt-3">
          <StatusBanner
            variant="success"
            title="Transaction confirmed successfully!"
            txHash={txHash}
            explorerBaseUrl={chainMetadata.explorerBaseUrl}
          />
        </div>
      )}

      {!connected && (
        <StatusBanner
          variant="wallet_required"
          message="Connect your wallet to see your live on-chain positions."
          onAction={connect}
          actionLabel="Connect"
        />
      )}

      {connected && isResolved && !hasWinningPosition && !txHash && (
        <p className="text-xs text-center text-[#8B93A7]">
          No winning shares to claim for this market.
        </p>
      )}

      {connected && !isResolved && (
        <p className="text-xs text-center text-[#8B93A7]">
          Live on-chain balance. Winnings can be claimed after resolution.
        </p>
      )}
    </div>
  );
}
