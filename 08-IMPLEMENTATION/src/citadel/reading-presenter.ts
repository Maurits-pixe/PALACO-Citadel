/**
 * CITADEL-READING-PRESENTER-001
 *
 * Framework-neutral interaction layer for the Citadel mobile Leeskompas.
 * The host renders state, provides a screen-reader live region, and controls
 * real focus and accessibility semantics. No DOM globals, no auth, no routing.
 */
import {
  createReadingLifecycle,
  type ReadingLifecycleChange,
} from "./reading-lifecycle";
import type { NavigationPort, NavigationResult } from "./reading-navigation";
import type { SiteRouteManifest } from "./reading-routes";
import type { StoragePort } from "./reading-state";
import { readingView, type ReadingViewModel } from "./reading-ui";

export type ReaderFeedbackKind = "idle" | "busy" | "success" | "notice" | "error";

export interface ReaderFeedback {
  readonly kind: ReaderFeedbackKind;
  readonly message: string;
  /** Host: render in a pre-existing aria-live polite or role=status node. */
  readonly announce: boolean;
  readonly busy: boolean;
  readonly view: ReadingViewModel;
}

export interface ReadingPresentationPort {
  /** Render button disabled/busy state and visible status without HTML injection. */
  render(feedback: ReaderFeedback): void;
  /** Announce via a host-owned aria-live node; never use alert() or modal. */
  announce(message: string): void;
}

export interface ReadingPresenter {
  /** User click/tap only: never invoke automatically when the view mounts. */
  onResumeClick(): Promise<NavigationResult>;
  /** Notify BEFORE route/session/permission changes or reader close. */
  beforeChange(change: ReadingLifecycleChange): void;
  /** Call only once the user has explicitly confirmed the local wipe. */
  onClearConfirmed(): void;
  /** Release this presenter on unmount; discard late messages. */
  dispose(): void;
}

export function createReadingPresenter(
  store: StoragePort,
  manifest: SiteRouteManifest,
  navigation: NavigationPort,
  presentation: ReadingPresentationPort,
): ReadingPresenter {
  const lifecycle = createReadingLifecycle(store, manifest, navigation);
  let revision = 0;
  let disposed = false;

  const present = (kind: ReaderFeedbackKind, message: string, announce: boolean): void => {
    if (disposed) return;
    const feedback: ReaderFeedback = {
      kind,
      message,
      announce,
      busy: kind === "busy",
      view: readingView(store),
    };
    // UI failures must not trigger new navigation or authorization.
    try { presentation.render(feedback); } catch { /* presentation unavailable */ }
    if (announce) {
      try { presentation.announce(message); } catch { /* live region unavailable */ }
    }
  };

  const kindFor = (result: NavigationResult): ReaderFeedbackKind =>
    result.kind === "opened" ? "success" :
    result.kind === "no-bookmark" || result.kind === "stale" ? "notice" : "error";

  present("idle", "", false);

  return {
    async onResumeClick(): Promise<NavigationResult> {
      if (disposed) {
        return { kind: "stale", message: "Het Leeskompas is gesloten." };
      }
      const current = ++revision;
      present("busy", "Leesplek wordt geopend.", false);
      let result: NavigationResult;
      try {
        result = await lifecycle.resumeFromClick();
      } catch {
        result = { kind: "navigation-failed", message: "Het openen is onderbroken." };
      }
      // Suppress late UI updates after a newer request, logout, or disposal.
      if (disposed || current !== revision) {
        return { kind: "stale", message: "Deze hervataanvraag is niet meer actueel." };
      }
      present(kindFor(result), result.message, result.kind !== "stale");
      return result;
    },

    beforeChange(change: ReadingLifecycleChange): void {
      if (disposed) return;
      ++revision;
      lifecycle.beforeChange(change);
      if (change !== "reader-closed") {
        present("idle", "", false);
      }
    },

    onClearConfirmed(): void {
      if (disposed) return;
      ++revision;
      const result = lifecycle.clearReadingMemoryAfterConfirmation(true);
      present(result.succeeded ? "success" : "error", result.message, true);
    },

    dispose(): void {
      if (disposed) return;
      ++revision;
      disposed = true;
      lifecycle.dispose();
    },
  };
}
