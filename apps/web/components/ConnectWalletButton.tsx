"use client";
// ConnectWalletButton.tsx
// Handles Freighter wallet connection via @creit.tech/stellar-wallets-kit.
// Currently renders a static button — the connection logic is stubbed.
// To wire up:
//   1. Initialise StellarWalletsKit from lib/wallet.ts
//   2. Call kit.openModal() on click
//   3. Store the connected public key in React context or Zustand
//   4. Update button label to show truncated address when connected

interface Props {
  className?: string;
}

export default function ConnectWalletButton({ className }: Props) {
  // TODO: replace with real wallet connection via lib/wallet.ts
  const handleClick = () => {
    console.log("ConnectWalletButton: wallet connection not yet implemented");
  };

  return (
    <button
      onClick={handleClick}
      className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-all ${className ?? ""}`}
      style={{
        borderColor: "#00D084",
        color: "#00D084",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#00D08420";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px #00D08440";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      Connect Wallet
    </button>
  );
}
