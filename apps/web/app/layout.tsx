import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { WalletProvider } from "@/context/WalletContext";
import { ToastProvider } from "@/context/ToastContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
    <html lang="en" className={`${geist.variable} h-full`}>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: "#0B0E14", color: "#F2F4F7" }}
      >
        <WalletProvider>
          <ToastProvider>
            <TopBar />
            {/* pb-20 reserves space so content never hides behind the floating bottom nav */}
            <main className="flex-1 pb-20">{children}</main>
            <BottomNav />
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
