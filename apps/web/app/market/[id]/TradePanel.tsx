"use client";

import { useState } from "react";
import { Market } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { Wallet, Loader2 } from "lucide-react";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "confirming";

export default function TradePanel({ market }: Props) {
  const { publicKey, connected, connecting, connect } = useWallet();
  const toast = useToast();
  const { chain, client, chainMetadata } = useChain();
  const [tab, setTab] = useState<"YES" | "NO">("YES");
  const [yesAmount, setYesAmount] = useState("");
  const [noAmount, setNoAmount] = useState("");

  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const isPending = pendingStep !== null;
  const isYes = tab === "YES";
  const currentAmount = isYes ? yesAmount : noAmount;
  const currency = chainMetadata.currency;

  const getStepLabel = (step: PendingStep): string => {
    switch (step) {
      case "simulating":
        return `Simulating trade on ${chainMetadata.name}…`;
      case "signing":
        return "Waiting for wallet signature…";
      case "confirming":
        return chain === "avalanche"
          ? "Waiting for block confirmation on Avalanche…"
          : "Confirming on Stellar ledger…";
    }
  };

  const yesPrice = market.yesPercent / 100;
  const noPrice = market.noPercent / 100;

  const estYesShares =
    yesAmount && parseFloat(yesAmount) > 0
      ? (parseFloat(yesAmount) / yesPrice).toFixed(2)
      : "—";
  const estNoShares =
    noAmount && parseFloat(noAmount) > 0
      ? (parseFloat(noAmount) / noPrice).toFixed(2)
      : "—";

  const handleBuy = async () => {
    if (!connected) {
      connect();
      return;
    }

    const amountNum = parseFloat(currentAmount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg(`Please enter a valid ${currency} amount greater than 0.`);
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));

      const callPromise = client.buyShares({
        marketId: market.id,
        outcome: tab.toLowerCase() as "yes" | "no",
        amount: amountNum,
        callerAddress: publicKey ?? undefined,
      });

      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2000);

      const result = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      toast.success(
        "Trade Confirmed!",
        `Successfully purchased ${tab} shares on ${chainMetadata.name}.`
      );
      if (isYes) setYesAmount("");
      else setNoAmount("");
    } catch (err) {
      let message = "Failed to execute trade.";
      if (err instanceof Error) {
        const raw = err.message;
        if (
          raw.includes("User rejected") ||
          raw.includes("User denied") ||
          raw.includes("rejected in your wallet") ||
          raw.includes("rejected in wallet")
        ) {
          message = "Transaction was cancelled in your wallet.";
        } else if (raw.includes("insufficient funds") || raw.includes("exceeds balance")) {
          message = `Insufficient ${currency} balance to complete this purchase (including gas fees).`;
        } else if (raw.includes("MarketNotFound")) {
          message = "Market does not exist on the smart contract.";
        } else if (raw.includes("MarketNotOpen")) {
          message = "This market is closed or has already been resolved.";
        } else if (raw.includes("MarketExpired")) {
          message = "This market has expired and is no longer accepting trades.";
        } else if (raw.includes("ZeroDeposit")) {
          message = `Amount must be greater than 0 ${currency}.`;
        } else if (raw.includes("not configured")) {
          message = raw;
        } else if (raw.includes("WalletClient is required")) {
          message = `Please connect your ${chainMetadata.shortName} wallet to trade.`;
        } else {
          message = raw;
        }
      }
      setErrorMsg(message);
      toast.error("Trade Failed", message);
      console.error("[TradePanel] buyShares error:", err);
    } finally {
      setPendingStep(null);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
        boxShadow: isYes
          ? "0 0 40px rgba(0,208,132,0.08)"
          : "0 0 40px rgba(255,77,94,0.08)",
        transition: "box-shadow 0.3s ease",
      }}
    >
      {/* Tab switcher */}
      <div className="flex" style={{ borderBottom: "1px solid #1E2435" }}>
        {(["YES", "NO"] as const).map((side) => (
          <button
            key={side}
            onClick={() => {
              setTab(side);
              setErrorMsg("");
              setTxHash("");
            }}
            disabled={isPending}
            className="side-tab flex-1 py-3 text-sm font-bold disabled:opacity-50"
            style={{
              color:
                tab === side
                  ? side === "YES"
                    ? "#00D084"
                    : "#FF4D5E"
                  : "#8B93A7",
              backgroundColor:
                tab === side
                  ? side === "YES"
                    ? "#00D08412"
                    : "#FF4D5E12"
                  : "transparent",
              borderBottom:
                tab === side
                  ? `2px solid ${side === "YES" ? "#00D084" : "#FF4D5E"}`
                  : "2px solid transparent",
            }}
          >
            Buy {side}
          </button>
        ))}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Price chip */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "#8B93A7" }}>
            Current price
          </p>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{
              backgroundColor: isYes ? "#00D08422" : "#FF4D5E22",
              color: isYes ? "#00D084" : "#FF4D5E",
            }}
          >
            {isYes ? market.yesPercent : market.noPercent}¢
          </span>
        </div>

        {/* Amount input */}
        <div>
          <label className="text-xs mb-2 block font-medium" style={{ color: "#8B93A7" }}>
            Amount ({currency})
          </label>
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${isYes ? "#00D08444" : "#FF4D5E44"}`,
              backgroundColor: "#0B0E14",
            }}
          >
            <span
              className="pl-3 text-sm select-none font-semibold"
              style={{ color: "#8B93A7" }}
            >
              {currency}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              disabled={isPending}
              value={isYes ? yesAmount : noAmount}
              onChange={(e) => {
                setErrorMsg("");
                if (isYes) setYesAmount(e.target.value);
                else setNoAmount(e.target.value);
              }}
              className="flex-1 bg-transparent py-3 pr-3 pl-2 text-sm outline-none disabled:opacity-50"
              style={{ color: "#F2F4F7" }}
            />
          </div>
        </div>

        {/* Estimate */}
        <div
          className="flex items-center justify-between text-xs rounded-lg px-3 py-2"
          style={{ backgroundColor: "#0B0E14" }}
        >
          <span style={{ color: "#8B93A7" }}>Est. shares</span>
          <span style={{ color: "#F2F4F7", fontWeight: 700 }}>
            {isYes ? estYesShares : estNoShares}
          </span>
        </div>

        {/* Pending step indicator */}
        {isPending && (
          <StatusBanner variant="pending" stepLabel={getStepLabel(pendingStep!)} />
        )}

        {/* Inline error display */}
        {errorMsg && !isPending && (
          <StatusBanner variant="error" title="Trade Failed" message={errorMsg} />
        )}

        {/* Success confirmation */}
        {txHash && !isPending && (
          <StatusBanner
            variant="success"
            title="Shares purchased successfully!"
            txHash={txHash}
          />
        )}

        {/* Buy / Connect button */}
        {connected ? (
          <button
            onClick={handleBuy}
            disabled={isPending || !currentAmount || parseFloat(currentAmount) <= 0}
            className={`w-full flex items-center justify-center gap-2 transition-all ${
              isYes ? "btn-yes" : "btn-no"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            style={{
              padding: "0.875rem",
              borderRadius: "0.75rem",
              fontWeight: 700,
              fontSize: "0.875rem",
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Processing trade on {chainMetadata.shortName}…
              </>
            ) : (
              `Buy ${tab}`
            )}
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: "#161B26",
              border: "1px solid #1E2435",
              color: "#8B93A7",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = chainMetadata.borderColor;
              (e.currentTarget as HTMLButtonElement).style.color = chainMetadata.color;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#1E2435";
              (e.currentTarget as HTMLButtonElement).style.color = "#8B93A7";
            }}
          >
            <Wallet size={15} strokeWidth={1.8} />
            {connecting ? "Connecting wallet…" : `Connect ${chainMetadata.shortName} wallet to trade`}
          </button>
        )}
      </div>
    </div>
  );
}
