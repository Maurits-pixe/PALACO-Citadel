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
  /** Call before the real session/permission/route transition. */
  beforeChange(change: ReadingLifecycleChange): void;
  /** Call only after the existing UI has explicitly confirmed clearing. */
  clearAfterConfirmation(): void;
  /** Remove listeners and invalidate in-flight work on unmount. */
  dispose(): void;
}

/**
 * Does not read or mutate stored consent during initialization.
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

  try {
  const navigation = createRenderedRoutePort(router);
  const presentation = createReadingDomPresentation(elements);
  const presenter = createReadingPresenter(storage, manifest, navigation, presentation);
  let disposed = false;

  const onResumeClick = (): void => {
    if (disposed || elements.resumeButton.disabled) return;
    // Deliberate click/tap, never called by hydration or automatic routing.
    void presenter.onResumeClick();
  };
  elements.resumeButton.addEventListener("click", onResumeClick);

  return {
    beforeChange(change: ReadingLifecycleChange): void {
      if (disposed) return;
      presenter.beforeChange(change);
      if (change === "reader-closed") {
        elements.resumeButton.removeEventListener("click", onResumeClick);
      }
    },
    clearAfterConfirmation(): void {
      if (!disposed) presenter.onClearConfirmed();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      elements.resumeButton.removeEventListener("click", onResumeClick);
      try { presenter.dispose(); } finally { release(); }
    },
  };
  } catch (error) {
    release();
    throw error;
  }
}
