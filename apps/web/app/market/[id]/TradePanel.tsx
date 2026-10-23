"use client";

import { useState, useEffect, useCallback } from "react";
import { Market } from "@/lib/markets";
import { outcomeColor } from "@/lib/types";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useChain } from "@/context/ChainContext";
import StatusBanner from "@/components/StatusBanner";
import { parseTransactionError } from "@/lib/errors";
import { Wallet, Loader2, ExternalLink, Coins } from "lucide-react";
import { SonicMarketClient } from "@predict-me/core";
import { parseUnits } from "viem";

interface Props {
  market: Market;
}

type PendingStep = "simulating" | "signing" | "confirming";
type ActionType = "approve" | "buy" | "mint" | "claim" | "refund";

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
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  // Sonic ERC-20 specific state — kept for future re-enable
  const isSonic = false;
  const [tokenSymbol] = useState<string | null>(null);
  const [tokenDecimals] = useState<number>(6);
  const [allowance] = useState<bigint>(0n);
  const [allowanceChecked] = useState(false);
  const [mintPending] = useState(false);
  const [mintTxHash] = useState("");

  // The trade currency
  const currency = chainMetadata.currency;

  const isPending = pendingStep !== null;
  const selectedLabel = outcomes[selectedIndex] ?? `Outcome ${selectedIndex + 1}`;
  const selectedColor = outcomeColor(selectedIndex);
  const selectedPercent = percents[selectedIndex] ?? 0;
  const selectedPrice = selectedPercent / 100;

  const getStepLabel = (step: PendingStep): string => {
    switch (step) {
      case "simulating":
        return `Simulating ${pendingAction ?? "trade"} on ${chainMetadata.name}…`;
      case "signing":
        return "Waiting for wallet signature…";
      case "confirming":
        return chain === "avalanche"
          ? "Waiting for block confirmation on Avalanche…"
          : "Confirming on Stellar ledger…";
    }
  };

  const estShares =
    amount && parseFloat(amount) > 0 && selectedPrice > 0
      ? (parseFloat(amount) / selectedPrice).toFixed(2)
      : "—";

  // ── Sonic: read token symbol, decimals, and allowance ──
  const loadTokenInfo = useCallback(async () => {
    if (!isSonic || !(client instanceof SonicMarketClient)) {
      setAllowanceChecked(false);
      return;
    }
    try {
      const info = await client.getTokenInfo();
      setTokenSymbol(info.symbol);
      setTokenDecimals(info.decimals);
    } catch (err) {
      console.warn("Failed to read Sonic token info:", err);
    }
  }, [isSonic, client]);

  const loadAllowance = useCallback(async () => {
    if (!isSonic || !publicKey || !(client instanceof SonicMarketClient)) {
      setAllowance(0n);
      setAllowanceChecked(false);
      return;
    }
    try {
      const allow = await client.getAllowance(publicKey);
      setAllowance(allow);
      setAllowanceChecked(true);
    } catch (err) {
      console.warn("Failed to read allowance:", err);
      setAllowanceChecked(true);
    }
  }, [isSonic, publicKey, client]);

  useEffect(() => {
    loadTokenInfo();
  }, [loadTokenInfo]);

  // Reload allowance when wallet, amount, or chain changes
  useEffect(() => {
    if (isSonic && connected && !isWrongNetwork) {
      loadAllowance();
    } else {
      setAllowanceChecked(false);
    }
  }, [isSonic, connected, isWrongNetwork, loadAllowance, amount]);

  // Amount in base units (for allowance comparison)
  const amountBigInt = amount && parseFloat(amount) > 0
    ? parseUnits(amount, tokenDecimals)
    : 0n;
  const needsApproval = isSonic && allowanceChecked && amountBigInt > 0n && allowance < amountBigInt;

  // ── Sonic: Get test tokens (mint) ──
  const handleGetTestTokens = async () => {
    if (!isSonic || !connected || !(client instanceof SonicMarketClient) || mintPending) return;
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }
    setMintPending(true);
    setMintTxHash("");
    setErrorMsg("");
    try {
      const result = await client.mintTestTokens("1000", publicKey ?? undefined);
      setMintTxHash(result.txHash);
      toast.success("Tokens Minted!", `1000 ${currency} minted to your wallet on ${chainMetadata.name}.`);
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency, action: "trade" });
      toast.error("Mint Failed", message);
      console.error("[TradePanel] mint error:", err);
    } finally {
      setMintPending(false);
    }
  };

  // ── Sonic: Approve ERC-20 ──
  const handleApprove = async () => {
    if (!isSonic || !connected || !(client instanceof SonicMarketClient) || isPending) return;
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg(`Please enter a valid ${currency} amount greater than 0.`);
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingAction("approve");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));
      const callPromise = client.approve(amount, publicKey ?? undefined);
      const signingTimer = setTimeout(() => setPendingStep("signing"), 300);
      const confirmingTimer = setTimeout(() => setPendingStep("confirming"), 2000);

      const result = await callPromise;
      clearTimeout(signingTimer);
      clearTimeout(confirmingTimer);

      setTxHash(result.txHash);
      toast.success("Approved!", `Spending approved for ${amount} ${currency}.`);
      // Refresh allowance
      await loadAllowance();
    } catch (err) {
      const message = parseTransactionError(err, { chain, currency, action: "trade" });
      setErrorMsg(message);
      toast.error("Approval Failed", message);
      console.error("[TradePanel] approve error:", err);
    } finally {
      setPendingStep(null);
      setPendingAction(null);
    }
  };

  const handleBuy = async () => {
    if (!connected) {
      connect();
      return;
    }

    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }

    // Sonic: must approve first
    if (isSonic && needsApproval) {
      await handleApprove();
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg(`Please enter a valid ${currency} amount greater than 0.`);
      return;
    }

    setErrorMsg("");
    setTxHash("");
    setPendingAction("buy");
    setPendingStep("simulating");

    try {
      await new Promise((r) => setTimeout(r, 0));

      const callPromise = client.buyShares({
        marketId: market.id,
        outcomeIndex: selectedIndex,
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
        `Successfully purchased ${selectedLabel} shares on ${chainMetadata.name}.`
      );
      setAmount("");
      // Notify PositionCard to refresh on-chain balance
      window.dispatchEvent(new CustomEvent("predict-me:buy", { detail: { marketId: market.id } }));
      // Refresh allowance after buy
      if (isSonic) await loadAllowance();
    } catch (err) {
      const message = parseTransactionError(err, {
        chain,
        currency,
        action: "trade",
      });
      setErrorMsg(message);
      toast.error("Trade Failed", message);
      console.error("[TradePanel] buyShares error:", err);
    } finally {
      setPendingStep(null);
      setPendingAction(null);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #161B26, #131820)",
        border: "1px solid #1E2435",
        boxShadow: `0 0 40px ${selectedColor}14`,
        transition: "box-shadow 0.3s ease",
      }}
    >
      {/* Outcome selector — N options, wraps without breaking layout */}
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
              onClick={() => {
                setSelectedIndex(i);
                setErrorMsg("");
                setTxHash("");
              }}
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
          <p className="text-xs" style={{ color: "#8B93A7" }}>
            {selectedLabel} price
          </p>
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
              onChange={(e) => {
                setErrorMsg("");
                setAmount(e.target.value);
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
          <span style={{ color: "#8B93A7" }}>Est. {selectedLabel} shares</span>
          <span style={{ color: "#F2F4F7", fontWeight: 700 }}>{estShares}</span>
        </div>

        {/* Sonic: Get test tokens button */}
        {isSonic && connected && !isWrongNetwork && (
          <button
            onClick={handleGetTestTokens}
            disabled={mintPending || isPending}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.12)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              color: "#8B5CF6",
            }}
          >
            {mintPending ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Minting test tokens…
              </>
            ) : (
              <>
                <Coins size={13} />
                Get test {currency} tokens
              </>
            )}
          </button>
        )}

        {/* Sonic: mint success */}
        {mintTxHash && !mintPending && (
          <StatusBanner
            variant="success"
            title="Test tokens minted!"
            txHash={mintTxHash}
            explorerBaseUrl={chainMetadata.explorerBaseUrl}
          />
        )}

        {/* Wrong network warning */}
        {connected && isWrongNetwork && !isPending && (
          <StatusBanner
            variant="wrong_network"
            title="Wrong Network Selected"
            message={`Your wallet is connected to an unsupported network. Please switch to ${chainMetadata.name} to trade.`}
            onAction={switchNetwork}
            actionLabel="Switch Network"
          />
        )}

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
            title="Transaction confirmed successfully!"
            txHash={txHash}
            explorerBaseUrl={chainMetadata.explorerBaseUrl}
          />
        )}

        {/* Buy / Approve / Connect button */}
        {connected ? (
          isWrongNetwork ? (
            <button
              onClick={switchNetwork}
              className="w-full flex items-center justify-center gap-2 transition-all cursor-pointer text-white"
              style={{
                backgroundColor: "#E84142",
                padding: "0.875rem",
                borderRadius: "0.75rem",
                fontWeight: 700,
                fontSize: "0.875rem",
                boxShadow: "0 0 16px rgba(232, 65, 66, 0.35)",
              }}
            >
              Switch to {chainMetadata.name}
            </button>
          ) : isSonic && needsApproval ? (
            // ── Sonic two-step: show Approve first ──
            <button
              onClick={handleApprove}
              disabled={isPending || !amount || parseFloat(amount) <= 0}
              className="w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white"
              style={{
                backgroundColor: "#8B5CF6",
                padding: "0.875rem",
                borderRadius: "0.75rem",
                fontWeight: 700,
                fontSize: "0.875rem",
              }}
            >
              {isPending && pendingAction === "approve" ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Approving {currency}…
                </>
              ) : (
                `Approve ${currency} spending`
              )}
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
              {isPending && pendingAction === "buy" ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Processing trade on {chainMetadata.shortName}…
                </>
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

        {/* Sonic faucet link */}
        {isSonic && chainMetadata.faucetUrl && (
          <a
            href={chainMetadata.faucetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] flex items-center justify-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8B93A7" }}
          >
            <ExternalLink size={10} />
            Get S gas tokens from faucet
          </a>
        )}
      </div>
    </div>
  );
}
