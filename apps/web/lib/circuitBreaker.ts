/**
 * circuitBreaker.ts
 *
 * A generic circuit breaker for protecting external calls (wallet providers,
 * RPC endpoints, payment providers) from cascading failures.
 *
 * States:
 *   CLOSED    — calls pass through normally.
 *   OPEN      — calls fail immediately with CircuitOpenError (no network call).
 *               Trips after `failureThreshold` consecutive failures.
 *   HALF_OPEN — one probe call is allowed through after `resetTimeoutMs`.
 *               Success → CLOSED. Failure → OPEN again.
 *
 * Usage:
 *   const breaker = new CircuitBreaker("soroban-rpc", { failureThreshold: 3 });
 *   const result  = await breaker.call(() => server.getAccount(address));
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 3 */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN before attempting a probe. Default: 15000 */
  resetTimeoutMs?: number;
  /** Optional callback invoked whenever the state changes. */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(public readonly breakerName: string) {
    super(
      `Circuit "${breakerName}" is OPEN — external service is unavailable. Retry after a moment.`
    );
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureAt = 0;
  private probeInFlight = false;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: CircuitBreakerOptions["onStateChange"];

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs   = options.resetTimeoutMs   ?? 15_000;
    this.onStateChange    = options.onStateChange;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  private transition(next: CircuitState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.onStateChange?.(this.name, prev, next);
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws CircuitOpenError immediately if the circuit is OPEN.
   * Throws the original error (and records the failure) if `fn` throws.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "OPEN") {
      if (now - this.lastFailureAt >= this.resetTimeoutMs) {
        // Timeout elapsed — move to HALF_OPEN and let one probe through.
        // Guard against multiple concurrent probes with a flag.
        if (this.probeInFlight) {
          throw new CircuitOpenError(this.name);
        }
        this.transition("HALF_OPEN");
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    // CLOSED or HALF_OPEN — attempt the call
    if (this.state === "HALF_OPEN") {
      this.probeInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      // User-initiated rejections (wallet cancel, wrong network) should NOT
      // count as circuit failures — they are expected control-flow, not
      // infrastructure failures.
      if (isUserRejection(err)) {
        throw err;
      }
      this.onFailure();
      throw err;
    } finally {
      if (this.state === "HALF_OPEN") {
        this.probeInFlight = false;
      }
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.probeInFlight = false;
    this.transition("CLOSED");
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    this.probeInFlight = false;

    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.transition("OPEN");
    }
  }

  /** Manually reset to CLOSED (e.g. after a config change or user retry). */
  reset(): void {
    this.failures = 0;
    this.probeInFlight = false;
    this.transition("CLOSED");
  }

  /** Returns a snapshot of the breaker's current health metrics. */
  status(): { state: CircuitState; failures: number; lastFailureAt: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
    };
  }
}

/**
 * Returns true for errors that are caused by user action (wallet rejection,
 * wrong network, etc.) rather than infrastructure failure.
 * These should not trip the circuit breaker.
 */
function isUserRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const low = msg.toLowerCase();
  return (
    low.includes("rejected") ||
    low.includes("denied") ||
    low.includes("cancelled") ||
    low.includes("canceled") ||
    low.includes("user closed") ||
    low.includes("wrong network") ||
    low.includes("chain mismatch") ||
    // WalletError codes
    (err instanceof Error && (err as any).code === "REJECTED") ||
    (err instanceof Error && (err as any).code === "WRONG_NETWORK")
  );
}

// ── Shared breaker registry ───────────────────────────────────
// One breaker per external service, shared across all call sites.
// Keyed by a human-readable service name.

const _registry = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker from the global registry.
 * Options are only applied on first creation.
 */
export function getBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  if (!_registry.has(name)) {
    _registry.set(name, new CircuitBreaker(name, options));
  }
  return _registry.get(name)!;
}
