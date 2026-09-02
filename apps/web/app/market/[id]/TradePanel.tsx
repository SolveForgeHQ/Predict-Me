"use client";

import { useState } from "react";
import { Market } from "@/lib/markets";
import { useWallet } from "@/context/WalletContext";
import { buyShares, ContractError } from "@/lib/contract";
import { Wallet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "confirming";

const STEP_LABEL: Record<PendingStep, string> = {
  simulating: "Simulating transaction…",
  signing: "Waiting for wallet signature…",
  confirming: "Confirming on ledger…",
};

export default function TradePanel({ market }: Props) {
  const { publicKey, connected, connecting, connect } = useWallet();
  const [tab, setTab] = useState<"YES" | "NO">("YES");
  const [yesAmount, setYesAmount] = useState("");
  const [noAmount, setNoAmount] = useState("");

  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const isPending = pendingStep !== null;
  const isYes = tab === "YES";
  const currentAmount = isYes ? yesAmount : noAmount;

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
      setErrorMsg("Please enter a valid XLM amount greater than 0.");
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));

      const callPromise = buyShares(
        publicKey!,
        market.id,
        tab,
        amountNum
      );

      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2000);

      const hash = await callPromise;

      clearTimeout(signingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(hash);
      if (isYes) setYesAmount("");
      else setNoAmount("");
    } catch (err) {
      if (err instanceof ContractError) {
        switch (err.code) {
          case "NOT_CONFIGURED":
            setErrorMsg("Contract not configured. Please set NEXT_PUBLIC_MARKET_CONTRACT_ID and NEXT_PUBLIC_SOROBAN_RPC_URL in .env.local.");
            break;
          case "SIGN_REJECTED":
            setErrorMsg("Transaction was rejected in your wallet.");
            break;
          case "SIMULATION_FAILED":
            setErrorMsg(`Simulation failed: ${err.message}`);
            break;
          case "SUBMIT_FAILED":
            setErrorMsg(`Transaction failed on-chain: ${err.message}`);
            break;
          default:
            setErrorMsg(err.message);
        }
      } else {
        setErrorMsg("Failed to execute trade. Check console for details.");
        console.error("[TradePanel] buyShares error:", err);
      }
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
            Amount (XLM)
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
              XLM
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
          <div
            className="rounded-xl px-4 py-3 text-xs flex items-center gap-2.5"
            style={{
              backgroundColor: "#0D1829",
              border: "1px solid #1E3A5F",
              color: "#60A5FA",
            }}
          >
            <Loader2 size={14} className="animate-spin shrink-0" />
            <span className="font-medium">{STEP_LABEL[pendingStep!]}</span>
          </div>
        )}

        {/* Inline error display */}
        {errorMsg && !isPending && (
          <div
            className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 leading-relaxed"
            style={{
              backgroundColor: "#1A0F14",
              border: "1px solid #FF4D5E44",
              color: "#FF4D5E",
            }}
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Trade Failed</p>
              <p className="opacity-90">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Success confirmation */}
        {txHash && !isPending && (
          <div
            className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 leading-relaxed"
            style={{
              backgroundColor: "#00D08418",
              border: "1px solid #00D08433",
              color: "#00D084",
            }}
          >
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold">Shares purchased successfully!</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline opacity-80 hover:opacity-100 font-mono break-all text-[11px]"
              >
                View on Stellar Expert ↗
              </a>
            </div>
          </div>
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
                Processing…
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
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#00D08455";
              (e.currentTarget as HTMLButtonElement).style.color = "#00D084";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#1E2435";
              (e.currentTarget as HTMLButtonElement).style.color = "#8B93A7";
            }}
          >
            <Wallet size={15} strokeWidth={1.8} />
            {connecting ? "Connecting wallet…" : "Connect wallet to trade"}
          </button>
        )}
      </div>
    </div>
  );
}
