/**
 * CITADEL-READING-DOM-ADMISSION-001
 * Check host-provided UI nodes before any listener or renderer is installed.
 *
 * Structural check only: it does not authenticate the owner or authorize
 * routes. The authenticated host must supply these existing elements.
 */
import type { ReadingDomElements } from "./reading-dom";

export type DomAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "missing-element"
        | "detached-element"
        | "mixed-documents"
        | "duplicate-element"
        | "invalid-resume-button"
        | "missing-live-region";
    };

export function admitReadingDomElements(
  elements: ReadingDomElements,
): DomAdmission {
  if (elements === null || typeof elements !== "object") {
    return { ok: false, reason: "missing-element" };
  }
  const { resumeButton, statusText, liveStatus, memoryText } = elements;
  const nodes = [resumeButton, statusText, liveStatus, memoryText];
  if (nodes.some(node => !node || typeof node !== "object" ||
      typeof node.setAttribute !== "function")) {
    return { ok: false, reason: "missing-element" };
  }
  if (new Set(nodes).size !== nodes.length) {
    return { ok: false, reason: "duplicate-element" };
  }
  if (nodes.some(node => !node.isConnected)) {
    return { ok: false, reason: "detached-element" };
  }
  const doc = resumeButton.ownerDocument;
  if (!doc || nodes.some(node => node.ownerDocument !== doc)) {
    return { ok: false, reason: "mixed-documents" };
  }
  // Avoid accidental form submission when the user clicks "Verder lezen".
  if (resumeButton.tagName !== "BUTTON" || resumeButton.type !== "button") {
    return { ok: false, reason: "invalid-resume-button" };
  }
  if (liveStatus.getAttribute("aria-live") !== "polite" &&
      liveStatus.getAttribute("role") !== "status") {
    return { ok: false, reason: "missing-live-region" };
  }
  return { ok: true };
}
