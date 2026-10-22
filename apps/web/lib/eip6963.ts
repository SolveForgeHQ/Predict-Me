/**
 * eip6963.ts
 *
 * EIP-6963 Multi Injected Provider Discovery.
 *
 * Solves the "wallet collision" problem where Core and MetaMask both
 * overwrite window.ethereum. Instead of reading the shared global, we
 * listen for announcement events from each installed extension and pick
 * the specific provider by its rdns identifier.
 *
 * Known rdns values:
 *   Core      → "app.core.extension"  (https://docs.core.app)
 *   MetaMask  → "io.metamask"
 *
 * Usage:
 *   const providers = await discoverProviders();
 *   const core = providers.find(p => p.info.rdns === "app.core.extension");
 *   if (core) {
 *     await core.provider.request({ method: "eth_requestAccounts" });
 *   }
 */

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;   // data URI
  rdns: string;
}

export interface EIP6963AnnounceProviderEvent {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isCore?: boolean;
}

/** Known wallet rdns identifiers. */
export const WALLET_RDNS = {
  core: "app.core.extension",
  metamask: "io.metamask",
} as const;

/**
 * Discover all EIP-6963 providers currently installed in the browser.
 * Returns a promise that resolves after a short timeout (300ms) to allow
 * all extensions to announce themselves.
 */
export function discoverProviders(): Promise<EIP6963AnnounceProviderEvent[]> {
  return new Promise((resolve) => {
    const providers: EIP6963AnnounceProviderEvent[] = [];

    if (typeof window === "undefined") {
      resolve([]);
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963AnnounceProviderEvent>).detail;
      if (detail && detail.provider && detail.info) {
        // Deduplicate by rdns — some wallets announce multiple times.
        if (!providers.find((p) => p.info.rdns === detail.info.rdns)) {
          providers.push(detail);
        }
      }
    };

    window.addEventListener("eip6963:announceProvider", handler);

    // Request all installed wallets to announce themselves.
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Give extensions 300ms to respond, then resolve.
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handler);
      resolve(providers);
    }, 300);
  });
}

/**
 * Find a specific wallet provider by rdns.
 * Returns null if not found.
 */
export async function findProvider(
  rdns: string
): Promise<EIP6963AnnounceProviderEvent | null> {
  const all = await discoverProviders();
  return all.find((p) => p.info.rdns === rdns) ?? null;
}

/**
 * Check if a specific wallet is installed by rdns.
 */
export async function isWalletInstalled(rdns: string): Promise<boolean> {
  const provider = await findProvider(rdns);
  return provider !== null;
}

/**
 * Connect to a specific wallet by rdns and return the account address.
 * Throws if the wallet is not installed or the user rejects.
 */
export async function connectToWallet(
  rdns: string
): Promise<{ address: string; provider: EIP1193Provider }> {
  const announce = await findProvider(rdns);
  if (!announce) {
    throw new Error(`Wallet "${rdns}" is not installed.`);
  }

  const accounts = (await announce.provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned from wallet.");
  }

  return { address: accounts[0], provider: announce.provider };
}
