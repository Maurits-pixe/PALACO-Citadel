/**
 * CITADEL-READING-DOM-001
 *
 * Optional, host-wired DOM renderer for the private Citadel Leeskompas.
 * The host supplies pre-existing, trusted elements. No HTML injection,
 * global document lookup, event listeners, routing, storage or auth.
 */
import type {
  ReadingPresentationPort,
  ReaderFeedback,
} from "./reading-presenter";

export interface ReadingDomElements {
  /** Real button that triggers the explicit user resume action. */
  readonly resumeButton: HTMLButtonElement;
  /** Visible status text; not a live-region duplicate. */
  readonly statusText: HTMLElement;
  /** Pre-existing node with aria-live="polite" or role="status". */
  readonly liveStatus: HTMLElement;
  /** Pre-existing text node for consent / memory state. */
  readonly memoryText: HTMLElement;
}

export function createReadingDomPresentation(
  elements: ReadingDomElements,
): ReadingPresentationPort {
  const { resumeButton, statusText, liveStatus, memoryText } = elements;
  // The adapter does not create a landmark, override ARIA attributes on
  // unrelated nodes, or attach event handlers on behalf of the host.
  return {
    render(feedback: ReaderFeedback): void {
      resumeButton.disabled = feedback.busy || !feedback.view.canResume;
      resumeButton.setAttribute("aria-busy", feedback.busy ? "true" : "false");
      statusText.textContent = feedback.message;
      statusText.setAttribute("data-reading-status", feedback.kind);
      memoryText.textContent = feedback.view.memoryLabel;
    },
    announce(message: string): void {
      // Always textContent; no user-provided HTML, interpolated selector or URL.
      liveStatus.textContent = message;
    },
  };
}

/**
 * Programmatically focus only an existing chapter heading inside the
 * trusted route container. No selector is built from a bookmark ID.
 *
 * The host must run its normal route authorization and session guard before
 * calling this helper. This helper cannot grant access to a heading.
 */
export function focusTrustedChapter(
  routeContainer: HTMLElement,
  chapterId: string,
): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(chapterId)) return false;
  const headings = routeContainer.querySelectorAll<HTMLElement>(
    "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
  );
  let match: HTMLElement | null = null;
  for (const heading of headings) {
    if (heading.id !== chapterId) continue;
    // Duplicate IDs are ambiguous: reject rather than focusing arbitrarily.
    if (match !== null) return false;
    match = heading;
  }
  if (match === null) return false;
  return focusHeading(match);
}

/** Fallback only to an existing, site-owned region heading. */
export function focusTrustedRegion(
  routeContainer: HTMLElement,
): boolean {
  const heading = routeContainer.querySelector<HTMLElement>(
    "h1[data-citadel-region-heading]",
  );
  return heading === null ? false : focusHeading(heading);
}

function focusHeading(heading: HTMLElement): boolean {
  // A heading without tabindex is made programmatically focusable.
  // Keep the attribute after focus to avoid disrupting assistive tech.
  if (!heading.hasAttribute("tabindex")) {
    heading.setAttribute("tabindex", "-1");
  }
  try {
    heading.focus({ preventScroll: false });
    return heading.ownerDocument.activeElement === heading;
  } catch {
    return false;
  }
}
