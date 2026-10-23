"use client";

import { useState } from "react";
import { Market } from "@/lib/markets";
import { outcomeColor } from "@/lib/types";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { parseTransactionError } from "@/lib/errors";
import { Wallet, Loader2 } from "lucide-react";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "confirming";

export default function TradePanel({ market }: Props) {
  const { publicKey, connected, connecting, connect, isWrongNetwork, switchNetwork } = useWallet();
  const toast = useToast();
  const { chain, client, chainMetadata } = useChain();

  const outcomes = market.outcomes.length >= 2 ? market.outcomes : ["YES", "NO"];
  const percents = market.outcomePercents.length === outcomes.length
    ? market.outcomePercents
    : outcomes.map(() => Math.round(100 / outcomes.length));

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amount, setAmount] = useState("");
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const currency = chainMetadata.currency;
  const isPending = pendingStep !== null;
  const selectedLabel = outcomes[selectedIndex] ?? `Outcome ${selectedIndex + 1}`;
  const selectedColor = outcomeColor(selectedIndex);
  const selectedPercent = percents[selectedIndex] ?? 0;
  const selectedPrice = selectedPercent / 100;

  const estShares =
    amount && parseFloat(amount) > 0 && selectedPrice > 0
      ? (parseFloat(amount) / selectedPrice).toFixed(2)
      : "—";

  const getStepLabel = (step: PendingStep): string => {
    switch (step) {
      case "simulating": return `Simulating trade on ${chainMetadata.name}…`;
      case "signing":    return "Waiting for wallet signature…";
      case "confirming": return `Waiting for confirmation on ${chainMetadata.name}…`;
    }
  };

  const handleBuy = async () => {
    if (!connected) { connect(); return; }
    if (isWrongNetwork) { await switchNetwork(); return; }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg(`Please enter a valid ${currency} amount greater than 0.`);
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));
      const t1 = setTimeout(() => setPendingStep("signing"), 300);
      const t2 = setTimeout(() => setPendingStep("confirming"), 2000);

      const result = await client.buyShares({
        marketId: market.id,
        outcomeIndex: selectedIndex,
        amount: amountNum,
        callerAddress: publicKey ?? undefined,
      });

      clearTimeout(t1); clearTimeout(t2);
      setTxHash(result.txHash);
      toast.success("Trade Confirmed!", `Successfully purchased ${selectedLabel} shares on ${chainMetadata.name}.`);
      setAmount("");
      window.dispatchEvent(new CustomEvent("predict-me:buy", { detail: { marketId: market.id } }));
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency, action: "trade" });
      setErrorMsg(message);
      toast.error("Trade Failed", message);
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
        boxShadow: `0 0 40px ${selectedColor}14`,
      }}
    >
      {/* Outcome tabs */}
      <div
        className={`grid ${outcomes.length <= 2 ? "grid-cols-2" : outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
        style={{ borderBottom: "1px solid #1E2435" }}
      >
        {outcomes.map((label, i) => {
          const color = outcomeColor(i);
          const active = selectedIndex === i;
          return (
            <button
              key={`${label}-${i}`}
              onClick={() => { setSelectedIndex(i); setErrorMsg(""); setTxHash(""); }}
              disabled={isPending}
              className="side-tab py-3 px-2 text-sm font-bold disabled:opacity-50 truncate"
              style={{
                color: active ? color : "#8B93A7",
                backgroundColor: active ? `${color}12` : "transparent",
                borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              }}
              title={label}
            >
              {label} · {percents[i] ?? 0}%
            </button>
          );
        })}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Price chip */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "#8B93A7" }}>{selectedLabel} price</p>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{ backgroundColor: `${selectedColor}22`, color: selectedColor }}
          >
            {selectedPercent}¢
          </span>
        </div>

        {/* Amount input */}
        <div>
          <label className="text-xs mb-2 block font-medium" style={{ color: "#8B93A7" }}>
            Amount ({currency})
          </label>
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{ border: `1px solid ${selectedColor}44`, backgroundColor: "#0B0E14" }}
          >
            <span className="pl-3 text-sm select-none font-semibold" style={{ color: "#8B93A7" }}>
              {currency}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              disabled={isPending}
              value={amount}
              onChange={(e) => { setErrorMsg(""); setAmount(e.target.value); }}
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
          <span style={{ color: "#8B93A7" }}>Est. {selectedLabel} shares</span>
          <span style={{ color: "#F2F4F7", fontWeight: 700 }}>{estShares}</span>
        </div>

        {/* Wrong network */}
        {connected && isWrongNetwork && !isPending && (
          <StatusBanner
            variant="wrong_network"
            title="Wrong Network"
            message={`Please switch to ${chainMetadata.name} to trade.`}
            onAction={switchNetwork}
            actionLabel="Switch Network"
          />
        )}

        {isPending && <StatusBanner variant="pending" stepLabel={getStepLabel(pendingStep!)} />}
        {errorMsg && !isPending && <StatusBanner variant="error" title="Trade Failed" message={errorMsg} />}
        {txHash && !isPending && (
          <StatusBanner
            variant="success"
            title="Transaction confirmed!"
            txHash={txHash}
            explorerBaseUrl={chainMetadata.explorerBaseUrl}
          />
        )}

        {/* Buy / Switch / Connect button */}
        {connected ? (
          isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: "#E84142" }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : (
            <button
              onClick={handleBuy}
              disabled={isPending || !amount || parseFloat(amount) <= 0}
              className="w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white"
              style={{
                backgroundColor: selectedColor,
                padding: "0.875rem",
                borderRadius: "0.75rem",
                fontWeight: 700,
                fontSize: "0.875rem",
              }}
            >
              {isPending ? (
                <><Loader2 size={15} className="animate-spin" />Processing…</>
              ) : (
                `Buy ${selectedLabel}`
              )}
            </button>
          )
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ backgroundColor: "#161B26", border: "1px solid #1E2435", color: "#8B93A7" }}
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
            {connecting ? "Connecting…" : `Connect ${chainMetadata.shortName} wallet to trade`}
          </button>
        )}

        {/* Gas faucet link */}
        {chainMetadata.faucetUrl && (
          <a
            href={chainMetadata.faucetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] flex items-center justify-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8B93A7" }}
          >
            Get {currency} gas tokens from faucet
          </a>
        )}
      </div>
    </div>
  );
}
