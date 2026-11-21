/**
 * CITADEL-READING-HOST-CONTRACT-001
 *
 * A single, explicit connection point for Citadel's actual router and
 * PALACO ONE session authority. This file does not implement either.
 * The host must supply its own independently trusted access checks.
 *
 * No global events, hardcoded login state, route guesses or auto-mounting.
 */
import {
  connectReadingHostEvents,
  type ConnectedReadingHost,
  type ReadingBeforeChangeSource,
} from "./reading-host-events";
import type { ReadingBridgeResult } from "./reading-host-bridge";
import type { ReadingMountOptions } from "./reading-mount";
import type { ReadingLifecycleChange } from "./reading-lifecycle";

export interface ReadingHostContract extends ReadingBeforeChangeSource {
  /**
   * Called each time activation is requested, AFTER the host has rendered
   * its current protected reader route. Return null on any access denial.
   */
  authorizeAndResolve(): Promise<ReadingMountOptions | null>;
  /**
   * Read CURRENT session, permissions and route synchronously, not a cached
   * prior approval. Used before AND immediately after mounting.
   */
  isStillAuthorized(): boolean;
  /**
   * Opaque non-identity revision. It MUST change on every route, session or
   * permission update, even if a trusted before-change event was missed.
   * Never return PP numbers, user IDs, tokens or other personal data.
   */
  readContextVersion(): string | null;
}

export interface ConnectedReadingContract {
  /** Explicit host action after verified render, never during registration. */
  activate(): Promise<ReadingBridgeResult>;
  /** For trusted transitions not emitted by subscribeBeforeChange. */
  beforeHostChange(change: ReadingLifecycleChange): void;
  /** Permanently invalidate and unsubscribe. */
  dispose(): void;
}

/**
 * Wires the four mandatory, host-owned capabilities together.
 * A constructed contract is not evidence that the callbacks are truthful,
 * nor that the real private Sites frontend uses this module.
 */
export function connectReadingHostContract(
  contract: ReadingHostContract,
): ConnectedReadingContract {
  if (contract === null || typeof contract !== "object" ||
      typeof contract.subscribeBeforeChange !== "function" ||
      typeof contract.authorizeAndResolve !== "function" ||
      typeof contract.isStillAuthorized !== "function" ||
      typeof contract.readContextVersion !== "function") {
    throw new Error("CITADEL_READING_HOST_CONTRACT_INCOMPLETE");
  }

  // Bind methods to the caller's contract because a class-backed host may
  // depend on this when reading the active session/router implementation.
  const source: ReadingBeforeChangeSource = {
    subscribeBeforeChange(handler): () => void {
      return contract.subscribeBeforeChange(handler);
    },
  };
  const connected: ConnectedReadingHost = connectReadingHostEvents(source);
  let closed = false;

  return {
    activate(): Promise<ReadingBridgeResult> {
      if (closed) return Promise.resolve({ kind: "stale" });
      return connected.activate(
        () => contract.authorizeAndResolve(),
        () => contract.isStillAuthorized(),
        () => contract.readContextVersion(),
      );
    },
    beforeHostChange(change): void {
      if (!closed) connected.beforeHostChange(change);
    },
    dispose(): void {
      if (closed) return;
      closed = true;
      connected.dispose();
    },
  };
}
