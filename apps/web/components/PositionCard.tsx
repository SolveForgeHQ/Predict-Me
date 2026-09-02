"use client";
// PositionCard.tsx
// Displays a user's current YES/NO share balance for a given market.
// Currently shows zeroes (mock state). When wallet integration is complete,
// fetch real positions from the contract using lib/contract.ts
// and pass them in as props from the market detail page.

import { Position } from "@/lib/types";

interface Props {
  position?: Position;
}

const EMPTY: Position = {
  yesShares: 0,
  noShares: 0,
  avgYesPrice: null,
  avgNoPrice: null,
};

export default function PositionCard({ position = EMPTY }: Props) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#161B26", border: "1px solid #1E2435" }}
    >
      <h2 className="text-sm font-bold mb-4" style={{ color: "#F2F4F7" }}>
        Your Position
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {/* YES */}
        <div
          className="rounded-xl p-3.5"
          style={{ backgroundColor: "#0B0E14", border: "1px solid #00D08433" }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: "#00D084" }}>
            YES Shares
          </p>
          <p className="text-xl font-extrabold" style={{ color: "#F2F4F7" }}>
            {position.yesShares}
          </p>
          <p className="text-xs mt-1" style={{ color: "#8B93A7" }}>
            Avg. price:{" "}
            {position.avgYesPrice != null
              ? `$${position.avgYesPrice.toFixed(2)}`
              : "—"}
          </p>
        </div>

        {/* NO */}
        <div
          className="rounded-xl p-3.5"
          style={{ backgroundColor: "#0B0E14", border: "1px solid #FF4D5E33" }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: "#FF4D5E" }}>
            NO Shares
          </p>
          <p className="text-xl font-extrabold" style={{ color: "#F2F4F7" }}>
            {position.noShares}
          </p>
          <p className="text-xs mt-1" style={{ color: "#8B93A7" }}>
            Avg. price:{" "}
            {position.avgNoPrice != null
              ? `$${position.avgNoPrice.toFixed(2)}`
              : "—"}
          </p>
        </div>
      </div>

      <p className="text-xs text-center mt-4" style={{ color: "#8B93A7" }}>
        Connect your wallet to see real positions.
      </p>
    </div>
  );
}
