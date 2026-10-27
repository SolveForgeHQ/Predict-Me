import ProfileView from "@/components/ProfileView";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Allow any wallet address to be rendered on-demand
export const dynamicParams = true;

export default async function WalletProfilePage({ params }: Props) {
  const { wallet } = await params;

  // Basic format check — EVM (0x + 40 hex) or Stellar (G + 55 alphanum)
  const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(wallet);
  const isStellarAddress = /^G[A-Z0-9]{55}$/.test(wallet);

  if (!isEvmAddress && !isStellarAddress) {
    notFound();
  }

  return <ProfileView wallet={wallet} />;
}
