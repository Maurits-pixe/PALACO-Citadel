/**
 * CITADEL-READING-NAVIGATION-001
 *
 * Explicit user-initiated navigation handoff. Does not grant access, mutate
 * storage, touch DOM or trigger network operations itself. All effects are
 * injected by the host Citadel frontend and must be independently reviewed.
 */
import {
  resolveResumeTarget,
  type ResumeTarget,
  type SiteRouteManifest,
} from "./reading-routes";
import { type StoragePort } from "./reading-state";

export interface NavigationPort {
  /** Host-owned cancellation/epoch check; false means the session or request has changed. */
  isCurrent(): boolean;
  /** Mandatory site-owned access decision; this module does not authorize. */
  canOpen(target: Exclude<ResumeTarget, { kind: "none" }>): Promise<boolean>;
  /** Navigate only to a checked, local manifest path. */
  navigate(path: string, isRequestCurrent: () => boolean): Promise<boolean>;
  /** Called only after successful navigation; the host locates its own heading. */
  focusChapter(chapterId: string): Promise<boolean>;
  /** Region-level focus fallback; never opens a different URL. */
  focusRegion(): Promise<boolean>;
}

export type NavigationResult =
  | { readonly kind: "no-bookmark"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }
  | { readonly kind: "stale"; readonly message: string }
  | { readonly kind: "navigation-failed"; readonly message: string }
  | { readonly kind: "focus-failed"; readonly message: string }
  | { readonly kind: "opened"; readonly message: string; readonly target: Exclude<ResumeTarget, { kind: "none" }> };

/**
 * Call exclusively from a deliberate "Verder lezen" click/tap.
 * The host must implement canOpen through its normal authenticated route
 * authorization and must verify any post-navigation session changes.
 *
 * An access denial or navigation failure never triggers a different route.
 * Focus failure is reported, not concealed as successful accessibility.
 */
export async function openSavedReadingPlace(
  store: StoragePort,
  manifest: SiteRouteManifest,
  port: NavigationPort,
): Promise<NavigationResult> {
  const target = resolveResumeTarget(store, manifest);
  if (target.kind === "none") {
    return { kind: "no-bookmark", message: "Er is geen geldige leesplek om te hervatten." };
  }

  const stale = (): boolean => {
    try { return !port.isCurrent(); } catch { return true; }
  };
  const staleResult = (): NavigationResult => ({
    kind: "stale",
    message: "De sessie of navigatieaanvraag is gewijzigd; hervatten is afgebroken.",
  });
  if (stale()) return staleResult();

  let allowed: boolean;
  try {
    allowed = await port.canOpen(target);
  } catch {
    return { kind: "blocked", message: "Toegang kon niet worden vastgesteld; hervatten is geblokkeerd." };
  }
  if (stale()) return staleResult();
  if (!allowed) {
    return { kind: "blocked", message: "Deze leesplek is niet toegankelijk met de huidige sessie." };
  }

  let navigated: boolean;
  try {
    navigated = await port.navigate(target.path, () => !stale());
  } catch {
    navigated = false;
  }
  if (stale()) return staleResult();
  if (!navigated) {
    return { kind: "navigation-failed", message: "Het openen van de leesplek is niet gelukt." };
  }

  // Access is re-evaluated after asynchronous routing before DOM focus.
  // The host must separately enforce authorization inside navigate().
  try {
    if (!(await port.canOpen(target))) {
      return { kind: "blocked", message: "De toegang tot deze leesplek is gewijzigd." };
    }
  } catch {
    return { kind: "blocked", message: "De toegang kon na navigatie niet opnieuw worden bevestigd." };
  }
  if (stale()) return staleResult();

  let focused: boolean;
  try {
    focused = target.kind === "chapter"
      ? await port.focusChapter(target.chapterId)
      : await port.focusRegion();
  } catch {
    focused = false;
  }
  if (stale()) return staleResult();
  if (!focused) {
    return { kind: "focus-failed", message: "De pagina is geopend, maar de focus kon niet worden geplaatst." };
  }

  return {
    kind: "opened",
    message: target.kind === "chapter"
      ? `Verder lezen bij ${target.label}.`
      : "Verder lezen in de gekozen regio.",
    target,
  };
}
