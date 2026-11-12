/**
 * CITADEL-READING-INTEGRATION-001
 * Public integration surface for the private Citadel Leeskompas.
 *
 * Explicit named exports only: no mount, consent change, route navigation,
 * DOM mutation, privileged action or browser access on module import.
 * Host must authenticate before rendering any admin or reader view.
 */
export {
  admitReadingDomElements,
  type DomAdmission,
} from "./reading-dom-admission";

export {
  snapshotReadingManifest,
} from "./reading-manifest-snapshot";

export {
  admitReadingManifest,
  isAdmittedReadingManifest,
  type ManifestAdmission,
} from "./reading-manifest-gate";

export {
  inspectReadingPreflight,
  type ReadingPreflight,
  type PreflightIssue,
} from "./reading-preflight";

export {
  createReadingAdminSnapshot,
  renderReadingAdminSnapshot,
  type ReadingAdminEvidence,
  type ReadingAdminSnapshot,
  type ReadingAdminCheck,
} from "./reading-admin";

export {
  connectReadingHostEvents,
  type ConnectedReadingHost,
  type ReadingBeforeChangeSource,
} from "./reading-host-events";

export {
  createReadingHostBridge,
  type ReadingHostBridge,
  type ReadingBridgeResult,
} from "./reading-host-bridge";

export {
  createReadingMountCoordinator,
  type ReadingMountCoordinator,
} from "./reading-mount-coordinator";

export {
  mountReadingCompass,
  type ReadingMountOptions,
  type MountedReadingCompass,
} from "./reading-mount";

export {
  type RenderedRouteHost,
} from "./reading-route-port";

export {
  type ReadingDomElements,
} from "./reading-dom";

export {
  type SiteRouteManifest,
} from "./reading-routes";

export {
  type StoragePort,
} from "./reading-state";

export {
  type ReadingLifecycleChange,
} from "./reading-lifecycle";
