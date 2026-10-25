import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { WalletProvider } from "@/context/WalletContext";
import { ToastProvider } from "@/context/ToastContext";
import { ChainProvider } from "@/context/ChainContext";

import RainbowWeb3Provider from "@/providers/RainbowWeb3Provider";

// Geist is loaded via the system font stack at build time so the build
// doesn't need network access to fonts.googleapis.com.
// When Netlify/Vercel builds have internet access, swap back to:
//   import { Geist } from "next/font/google";
//   const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// and add the className to <html>.

export const metadata: Metadata = {
  title: "predict-me — Decentralised Prediction Markets",
  description: "Trade on the outcome of real-world events.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: "#0B0E14", color: "#F2F4F7" }}
      >
        <RainbowWeb3Provider>
          <ChainProvider>
            <WalletProvider>
              <ToastProvider>
                <TopBar />
                {/* pb-20 reserves space so content never hides behind the floating bottom nav */}
                <main className="flex-1 pb-20">{children}</main>
                <BottomNav />
              </ToastProvider>
            </WalletProvider>
          </ChainProvider>
        </RainbowWeb3Provider>
      </body>
    </html>
  );
}
