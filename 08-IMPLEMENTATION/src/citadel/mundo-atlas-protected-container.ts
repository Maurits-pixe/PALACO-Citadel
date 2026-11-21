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
}

const REQUIRED: readonly (keyof AtlasProtectedContainerContract)[] = [
  "subscribeBeforeChange",
  "authorizeAndVerify",
  "isStillAuthorized",
  "readContextVersion",
  "currentProtectedContainer",
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
      // This is called only after admission and a synchronous host grant.
      // Ensure the host has not detached/replaced its protected root.
      const container = contract.currentProtectedContainer();
      if (!container || !container.isConnected ||
          typeof container.append !== "function" ||
          !container.ownerDocument) {
        throw new Error("MUNDO_ATLAS_PROTECTED_CONTAINER_UNAVAILABLE");
      }
      return mountAtlasDomView(container, view);
    },
  };

  return connectAtlasHostContract(mounted);
}
