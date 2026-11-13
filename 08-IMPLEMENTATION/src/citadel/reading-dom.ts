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
 * A focus candidate must belong to the currently connected, rendered route.
 * Reject hidden/inert subtrees, including ancestors outside the route node.
 * Visibility is checked at the moment of the explicit navigation handoff.
 */
function isAvailableHeading(
  routeContainer: HTMLElement,
  heading: HTMLElement,
): boolean {
  if (!routeContainer.isConnected || !heading.isConnected ||
      !routeContainer.contains(heading)) return false;
  let node: HTMLElement | null = heading;
  while (node !== null) {
    if (node.hidden || node.inert || node.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (!style || style.display === "none" || style.visibility === "hidden" ||
        style.visibility === "collapse") return false;
    node = node.parentElement;
  }
  return heading.getClientRects().length > 0;
}

/**
 * Focus only a unique chapter heading inside the host-authorized region.
 * No selector is assembled from a bookmarked ID.
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
    // Reject duplicates even when one is hidden: no ambiguous DOM target.
    if (match !== null) return false;
    match = heading;
  }
  if (match === null || !isAvailableHeading(routeContainer, match)) return false;
  return focusHeading(match);
}

/** Focus exactly one accessible host-marked region heading. */
export function focusTrustedRegion(routeContainer: HTMLElement): boolean {
  const headings = routeContainer.querySelectorAll<HTMLElement>(
    "h1[data-citadel-region-heading]",
  );
  if (headings.length !== 1) return false;
  const heading = headings.item(0);
  return isAvailableHeading(routeContainer, heading) && focusHeading(heading);
}

function focusHeading(heading: HTMLElement): boolean {
  const addedTabindex = !heading.hasAttribute("tabindex");
  if (addedTabindex) heading.setAttribute("tabindex", "-1");
  try {
    heading.focus({ preventScroll: false });
    const succeeded = heading.ownerDocument.activeElement === heading;
    if (!succeeded && addedTabindex) heading.removeAttribute("tabindex");
    return succeeded;
  } catch {
    if (addedTabindex) heading.removeAttribute("tabindex");
    return false;
  }
}
