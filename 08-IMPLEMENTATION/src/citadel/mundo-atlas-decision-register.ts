/**
 * MUNDO-ATLAS-DECISION-REGISTER-030
 *
 * Draft-only, in-memory review journal. Not signed, authenticated, durable,
 * tamper-proof or authoritative. The acceptance gate 029 remains HOLD.
 * The real host must validate reviewer authority and evidence independently.
 */
import {
  assessAtlasAcceptanceEvidence,
  type AtlasAcceptanceEvidence,
  type AtlasAcceptanceReport,
} from "./mundo-atlas-acceptance-gate";

export type AtlasDecisionKind =
  | "technical-review" | "owner-acceptance" | "decision-revoked";
export type AtlasReviewOutcome = "submitted" | "accepted" | "rejected";

export interface AtlasDecisionEntry {
  readonly sequence: number;
  readonly id: string;
  readonly previousId: string | null;
  readonly kind: AtlasDecisionKind;
  /** Anonymous non-sensitive role reference, NOT a verified identity. */
  readonly actorRef: string;
  /** External non-sensitive reference. NOT independently verified evidence. */
  readonly evidenceRef: string;
  readonly outcome: AtlasReviewOutcome;
  /** Only for decision-revoked; must reference a previously accepted entry. */
  readonly targetId?: string;
}

export interface AtlasDecisionJournal {
  readonly entries: readonly AtlasDecisionEntry[];
  readonly evidence: AtlasAcceptanceReport;
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly ownerClaimActive: boolean;
  readonly technicalClaimActive: boolean;
  readonly revokedIds: readonly string[];
  readonly errors: readonly string[];
}

const REFS = /^[A-Za-z0-9._:/#-]{4,160}$/;
const KINDS: readonly string[] = [
  "technical-review", "owner-acceptance", "decision-revoked",
];
const OUTCOMES: readonly string[] = ["submitted", "accepted", "rejected"];

/**
 * Fail-closed validation of the COMPLETE ordered journal.
 * Any malformed, duplicated, out-of-order, unlinked, or invalid revocation
 * leaves decision HOLD and no active claim. This is not a signature verifier.
 */
export function inspectAtlasDecisionJournal(
  records: readonly AtlasDecisionEntry[] | unknown,
  evidence: readonly AtlasAcceptanceEvidence[] | unknown = [],
): AtlasDecisionJournal {
  const evidenceReport = assessAtlasAcceptanceEvidence(evidence);
  const entries: AtlasDecisionEntry[] = [];
  const errors: string[] = [];
  const revoked = new Set<string>();
  const accepted = new Map<string, AtlasDecisionEntry>();
  const seen = new Set<string>();

  if (!Array.isArray(records) || records.length > 500) {
    errors.push("JOURNAL_NOT_AN_ARRAY_OR_TOO_LARGE");
  } else {
    for (const raw of records) {
      const value = raw as Partial<AtlasDecisionEntry> | null;
      const previous = entries.length ? entries[entries.length - 1].id : null;
      if (!value || typeof value !== "object" ||
          !Number.isSafeInteger(value.sequence) ||
          value.sequence !== entries.length + 1 ||
          typeof value.id !== "string" || !REFS.test(value.id) ||
          seen.has(value.id) || value.previousId !== previous ||
          !KINDS.includes(value.kind as string) ||
          typeof value.actorRef !== "string" || !REFS.test(value.actorRef) ||
          typeof value.evidenceRef !== "string" || !REFS.test(value.evidenceRef) ||
          !OUTCOMES.includes(value.outcome as string)) {
        errors.push("INVALID_ENTRY_AT_" + String(entries.length + 1));
        break;
      }
      if (value.kind === "decision-revoked") {
        if (value.outcome !== "accepted" ||
            typeof value.targetId !== "string" ||
            !accepted.has(value.targetId) || revoked.has(value.targetId)) {
          errors.push("INVALID_REVOCATION_AT_" + String(value.sequence));
          break;
        }
        revoked.add(value.targetId);
      } else {
        if (value.targetId !== undefined) {
          errors.push("UNEXPECTED_REVOCATION_TARGET_AT_" + String(value.sequence));
          break;
        }
        if (value.outcome === "accepted") {
          accepted.set(value.id, value as AtlasDecisionEntry);
        }
      }
      entries.push(Object.freeze({
        sequence: value.sequence,
        id: value.id,
        previousId: value.previousId,
        kind: value.kind as AtlasDecisionKind,
        actorRef: value.actorRef,
        evidenceRef: value.evidenceRef,
        outcome: value.outcome as AtlasReviewOutcome,
        ...(value.targetId ? { targetId: value.targetId } : {}),
      }));
      seen.add(value.id);
    }
  }

  const valid = errors.length === 0;
  const active = (kind: AtlasDecisionKind): boolean =>
    valid && entries.some((entry) => entry.kind === kind &&
      entry.outcome === "accepted" && !revoked.has(entry.id));

  return Object.freeze({
    entries: Object.freeze(entries),
    evidence: evidenceReport,
    decision: "HOLD" as const,
    activationPermitted: false as const,
    technicalClaimActive: active("technical-review"),
    ownerClaimActive: active("owner-acceptance"),
    revokedIds: Object.freeze([...revoked]),
    errors: Object.freeze(errors),
  });
}

/**
 * Append a record only when the current journal is structurally valid.
 * Returns a new frozen snapshot; the source is never mutated. Host must
 * persist and independently authenticate any real-world record.
 */
export function appendAtlasDecision(
  prior: readonly AtlasDecisionEntry[] | unknown,
  candidate: AtlasDecisionEntry,
): AtlasDecisionJournal {
  const checked = inspectAtlasDecisionJournal(prior);
  if (checked.errors.length) return checked;
  return inspectAtlasDecisionJournal([...checked.entries, candidate]);
}
