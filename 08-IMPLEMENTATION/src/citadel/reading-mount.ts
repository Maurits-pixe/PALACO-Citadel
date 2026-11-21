/**
 * CITADEL-READING-MOUNT-001
 *
 * Single, explicit integration point for a trusted, already authenticated
 * Citadel Leeskompas view. The host supplies its actual elements, storage,
 * verified route manifest, and guarded router. No guessed routes or IDs.
 *
 * Mount only after the host has established access to this private view.
 * This module does NOT establish access and is not a Sites deployment.
 */
import {
  createReadingDomPresentation,
  type ReadingDomElements,
} from "./reading-dom";
import { createReadingPresenter } from "./reading-presenter";
import { snapshotReadingManifest } from "./reading-manifest-snapshot";
import { admitReadingDomElements } from "./reading-dom-admission";
import type { ReadingLifecycleChange } from "./reading-lifecycle";
import {
  createRenderedRoutePort,
  type RenderedRouteHost,
} from "./reading-route-port";
import type { SiteRouteManifest } from "./reading-routes";
import type { StoragePort } from "./reading-state";

/** One active mount per real button for this module instance. */
const activeResumeButtons = new WeakSet<HTMLButtonElement>();

export interface ReadingMountOptions {
  readonly storage: StoragePort;
  readonly manifest: SiteRouteManifest;
  readonly router: RenderedRouteHost;
  readonly elements: ReadingDomElements;
}

export interface MountedReadingCompass {
  /** Finalize this mount before session, permission or route transitions. */
  beforeChange(change: ReadingLifecycleChange): void;
  /** Call only after the existing UI has explicitly confirmed clearing. */
  clearAfterConfirmation(): void;
  /** Remove listeners and invalidate in-flight work on unmount. */
  dispose(): void;
}

/**
 * Reads consent for initial presentation, but never changes consent on mount.
 * Registers exactly one listener on the host-provided resume button.
 *
 * Authorization remains mandatory in the host's canOpen() and
 * navigateAndRender() implementations. The host must call beforeChange()
 * and dispose() at its real lifecycle boundaries.
 */
export function mountReadingCompass(
  options: ReadingMountOptions,
): MountedReadingCompass {
  const { elements, storage, manifest, router } = options;
  // Fail before claiming a button or attaching listeners. An incomplete
  // manifest must never present bookmarks as valid navigation targets.
  const trustedManifest = snapshotReadingManifest(manifest);
  if (trustedManifest === null) {
    throw new Error("CITADEL_READING_MANIFEST_REJECTED");
  }
  const domAdmission = admitReadingDomElements(elements);
  if (!domAdmission.ok) {
    throw new Error(`CITADEL_READING_DOM_REJECTED:${domAdmission.reason}`);
  }
  if (activeResumeButtons.has(elements.resumeButton)) {
    throw new Error("CITADEL_READING_ALREADY_MOUNTED");
  }
  // Claim before creating a presenter so duplicate mounts cannot install
  // conflicting handlers or overwrite the currently rendered UI.
  activeResumeButtons.add(elements.resumeButton);
  let claimed = true;
  const release = (): void => {
    if (!claimed) return;
    claimed = false;
    activeResumeButtons.delete(elements.resumeButton);
  };

  let presenter: ReturnType<typeof createReadingPresenter> | null = null;
  let onResumeClick: (() => void) | null = null;
  let listenerAttached = false;
  let disposed = false;
  let closed = false;

  const removeListener = (): void => {
    if (!listenerAttached || onResumeClick === null) return;
    listenerAttached = false;
    elements.resumeButton.removeEventListener("click", onResumeClick);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    closed = true;
    try {
      removeListener();
    } finally {
      try {
        presenter?.dispose();
      } finally {
        release();
      }
    }
  };

  try {
    const navigation = createRenderedRoutePort(router);
    const presentation = createReadingDomPresentation(elements);
    presenter = createReadingPresenter(storage, trustedManifest, navigation, presentation);

    onResumeClick = (): void => {
      if (disposed || closed || elements.resumeButton.disabled) return;
      // DOM might have been replaced without the mandatory host lifecycle hook.
      // Fail closed instead of navigating from a detached reader.
      if (!admitReadingDomElements(elements).ok) {
        dispose();
        return;
      }
      // Deliberate click/tap; no automatic resume on mount or page hydration.
      void presenter?.onResumeClick();
    };
    // Mark as attached before registration; if an injected host throws after
    // registering, the catch path still attempts listener removal.
    listenerAttached = true;
    elements.resumeButton.addEventListener("click", onResumeClick);

    return {
      beforeChange(_change: ReadingLifecycleChange): void {
        // A route/session/permission epoch change makes the frozen manifest
        // and captured DOM context obsolete. Invalidate immediately and
        // require a fresh authorized mount, regardless of change type.
        // dispose() also releases the button and suppresses late responses.
        dispose();
      },
      clearAfterConfirmation(): void {
        if (!disposed && !closed) presenter?.onClearConfirmed();
      },
      dispose,
    };
  } catch (error) {
    try {
      dispose();
    } catch {
      // Preserve the original mounting failure; all cleanup was attempted.
    }
    throw error;
  }
}
