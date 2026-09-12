"use client";

import { useState, useEffect, useCallback } from "react";
import { Market } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { Loader2, Gift, RefreshCw } from "lucide-react";

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
  const { publicKey, connected, connect } = useWallet();
  const toast = useToast();
  const { client, chain, chainMetadata } = useChain();
  const [yesShares, setYesShares] = useState<number>(0);
  const [noShares, setNoShares] = useState<number>(0);
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);
  const [onChainMarket, setOnChainMarket] = useState<{ status: string; outcome?: string } | null>(null);

  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const isPending = pendingStep !== null;

  // Market is considered resolved if either static data or on-chain contract reports resolved
  const isResolved =
    market.status === "resolved_yes" ||
    market.status === "resolved_no" ||
    onChainMarket?.status === "resolved";

  const winningSide: "YES" | "NO" | null =
    onChainMarket?.status === "resolved" && onChainMarket.outcome
      ? (onChainMarket.outcome.toUpperCase() as "YES" | "NO")
      : market.status === "resolved_yes"
      ? "YES"
      : market.status === "resolved_no"
      ? "NO"
      : null;

  const winningShares =
    winningSide === "YES" ? yesShares : winningSide === "NO" ? noShares : 0;
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
      setYesShares(0);
      setNoShares(0);
      return;
    }

    setIsLoadingPosition(true);
    try {
      const [pos, mkt] = await Promise.all([
        client.getPosition(market.id, publicKey),
        client.getMarket(market.id).catch(() => null),
      ]);

      if (pos) {
        setYesShares(pos.yesShares);
        setNoShares(pos.noShares);
      }

      if (mkt) {
        setOnChainMarket({
          status: mkt.status,
          outcome: mkt.resolvedOutcome,
        });
      }
    } catch (err) {
      console.warn("Failed to load position:", err);
    } finally {
      setIsLoadingPosition(false);
    }
  }, [connected, publicKey, market.id, client]);

  useEffect(() => {
    loadPositionAndMarket();
  }, [loadPositionAndMarket]);

  // ── Claim winnings via the active chain client ─────────────────────
  const handleClaim = async () => {
    if (!connected || !publicKey || !hasWinningPosition || isPending) return;

    setErrorMsg("");
    setTxHash("");
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
          : `${winningShares} winning ${winningSide} shares`;

      toast.success(
        "Winnings Claimed!",
        `Successfully claimed ${payoutText} on ${chainMetadata.name}.`
      );

      // Refresh on-chain balance after claim
      await loadPositionAndMarket();
    } catch (err) {
      let message = "Failed to claim winnings.";
      if (err instanceof Error) {
        const raw = err.message;
        if (
          raw.includes("User rejected") ||
          raw.includes("User denied") ||
          raw.includes("rejected in your wallet") ||
          raw.includes("rejected in wallet")
        ) {
          message = "Transaction was cancelled in your wallet.";
        } else if (raw.includes("MarketNotResolved")) {
          message = "This market has not been resolved yet.";
        } else if (raw.includes("NoWinningShares")) {
          message = "You have no winning shares to claim in this market.";
        } else if (raw.includes("TransferFailed")) {
          message = "Payout transfer failed on-chain.";
        } else if (raw.includes("not configured")) {
          message = raw;
        } else if (raw.includes("WalletClient is required")) {
          message = `Please connect your ${chainMetadata.shortName} wallet to claim winnings.`;
        } else {
          message = raw;
        }
      }
      setErrorMsg(message);
      toast.error("Claim Failed", message);
      console.error("[PositionCard] claimWinnings error:", err);
    } finally {
      setPendingStep(null);
    }
  };

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

        {isResolved && (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded"
            style={{
              backgroundColor: market.status === "resolved_yes" ? "#00D08422" : "#FF4D5E22",
              color: market.status === "resolved_yes" ? "#00D084" : "#FF4D5E",
            }}
          >
            Resolved: {winningSide}
          </span>
        )}
      </div>

      {/* Share balances */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* YES */}
        <div
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: "#0B0E14",
            border: `1px solid ${
              market.status === "resolved_yes" && yesShares > 0 ? "#00D08488" : "#00D08433"
            }`,
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold" style={{ color: "#00D084" }}>
              YES Shares
            </p>
            {market.status === "resolved_yes" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#00D08422] text-[#00D084]">
                WON
              </span>
            )}
          </div>
          <p className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>
            {connected ? (isLoadingPosition ? "…" : yesShares) : 0}
          </p>
        </div>

        {/* NO */}
        <div
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: "#0B0E14",
            border: `1px solid ${
              market.status === "resolved_no" && noShares > 0 ? "#FF4D5E88" : "#FF4D5E33"
            }`,
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold" style={{ color: "#FF4D5E" }}>
              NO Shares
            </p>
            {market.status === "resolved_no" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FF4D5E22] text-[#FF4D5E]">
                WON
              </span>
            )}
          </div>
          <p className="text-2xl font-extrabold" style={{ color: "#F2F4F7" }}>
            {connected ? (isLoadingPosition ? "…" : noShares) : 0}
          </p>
        </div>
      </div>

      {/* Claim Winnings Section */}
      {connected && hasWinningPosition && (
        <div className="pt-3" style={{ borderTop: "1px solid #1E2435" }}>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span style={{ color: "#8B93A7" }}>Claimable Outcome:</span>
            <span className="font-bold text-[#00D084]">
              {winningShares} Winning {winningSide} Shares
            </span>
          </div>

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
            {isPending ? (
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
          <StatusBanner variant="error" title="Claim Failed" message={errorMsg} />
        </div>
      )}

      {/* Inline claim success */}
      {txHash && !isPending && (
        <div className="mt-3">
          <StatusBanner
            variant="success"
            title="Winnings claimed successfully!"
            txHash={txHash}
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
