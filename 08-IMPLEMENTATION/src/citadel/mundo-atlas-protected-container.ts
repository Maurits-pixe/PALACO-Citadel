/**
 * MUNDO-ATLAS-PROTECTED-CONTAINER-015
 *
 * Explicit composition point for a real Citadel protected DOM container.
 * No route discovery, PALACO ONE API assumptions, automatic authentication,
 * global events, public preview imports or persistent storage.
 */
import {
  connectAtlasHostContract,
  type AtlasHostContract,
  type ConnectedAtlasHost,
} from "./mundo-atlas-host-contract";
import { mountAtlasDomView } from "./mundo-atlas-dom-adapter";
import type { AtlasView } from "./mundo-atlas-render-projection";

export interface AtlasProtectedContainerContract
  extends Omit<AtlasHostContract, "mount"> {
  /**
   * Return the CURRENT, host-owned, protected Atlas container, or null.
   * Must never resolve a public page or unprotected document root.
   * The host must verify this container belongs to its protected route.
   */
  currentProtectedContainer(): HTMLElement | null;
  /**
   * Independent host assertion tied to CURRENT protected route and access.
   * Must return false for document.body, public nodes, and stale containers.
   * An HTML element existing or being connected is NOT sufficient.
   */
  isProtectedContainerAuthorized(container: HTMLElement): boolean;
}

const REQUIRED: readonly (keyof AtlasProtectedContainerContract)[] = [
  "subscribeBeforeChange",
  "authorizeAndVerify",
  "isStillAuthorized",
  "readContextVersion",
  "currentProtectedContainer",
  "isProtectedContainerAuthorized",
];

/**
 * Binds verified data admission, lifecycle events and scoped DOM rendering.
 * The contract is supplied by the actual protected host: this factory cannot
 * prove that a returned element is protected or the source is authenticated.
 *
 * Call beforeContextChange() BEFORE replacing the container or identity.
 * Mounts never fall back to document.body, a guessed selector, or a stale node.
 */
export function connectAtlasProtectedContainer(
  contract: AtlasProtectedContainerContract,
): ConnectedAtlasHost {
  if (contract === null || typeof contract !== "object" ||
      REQUIRED.some((key) => typeof contract[key] !== "function")) {
    throw new Error("MUNDO_ATLAS_PROTECTED_CONTAINER_INCOMPLETE");
  }

  const mounted: AtlasHostContract = {
    subscribeBeforeChange: (handler) => contract.subscribeBeforeChange(handler),
    authorizeAndVerify: (envelope) => contract.authorizeAndVerify(envelope),
    isStillAuthorized: (world, kind) => contract.isStillAuthorized(world, kind),
    readContextVersion: () => contract.readContextVersion(),
    mount: (view: AtlasView) => {
      // A protected container is provided exclusively by the real host.
      // Snapshot context BEFORE reading it: a user-owned accessor may
      // synchronously change the session, route or permissions.
      const before = contract.readContextVersion();
      if (typeof before !== "string" || before.length === 0) {
        throw new Error("MUNDO_ATLAS_MOUNT_CONTEXT_UNAVAILABLE");
      }
      const container = contract.currentProtectedContainer();
      if (!container || !container.isConnected ||
          typeof container.append !== "function" ||
          !container.ownerDocument ||
          !contract.isProtectedContainerAuthorized(container) ||
          contract.readContextVersion() !== before) {
        throw new Error("MUNDO_ATLAS_PROTECTED_CONTAINER_UNAVAILABLE");
      }

      // The DOM adapter builds detached and only appends a completed tree.
      // Keep its exact cleanup handle; do not remove all container children.
      const created = mountAtlasDomView(container, view);
      try {
        // Reentrant route changes and host container swaps must never leave
        // the previous world visible. Do not publish a stale mount handle.
        if (!container.isConnected ||
            contract.currentProtectedContainer() !== container ||
            !contract.isProtectedContainerAuthorized(container) ||
            contract.readContextVersion() !== before) {
          throw new Error("MUNDO_ATLAS_MOUNT_CONTEXT_CHANGED");
        }
        return created;
      } catch (error) {
        try { created.dispose(); } catch { /* never restore stale data */ }
        throw error;
      }
    },
  };

  return connectAtlasHostContract(mounted);
}
