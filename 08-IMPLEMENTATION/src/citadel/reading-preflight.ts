/**
 * CITADEL-READING-PREFLIGHT-001
 *
 * Read-only integration diagnostics. No access decisions, persistence,
 * automatic migration, network requests, or user acceptance assertions.
 */
import {
  admitReadingManifest,
  type ManifestAdmission,
} from "./reading-manifest-gate";
import { resolveResumeTarget, type SiteRouteManifest } from "./reading-routes";
import { readingStatus, type StoragePort } from "./reading-state";

export type PreflightIssue =
  | "manifest-invalid"
  | "storage-unavailable"
  | "consent-disabled"
  | "no-saved-position";

export interface ReadingPreflight {
  readonly manifest: ManifestAdmission;
  readonly memory: "enabled" | "disabled" | "unavailable";
  readonly resume: "chapter" | "region" | "none";
  readonly issues: readonly PreflightIssue[];
  /** Preparation only. Does NOT mean authorized, integrated or tested. */
  readonly canOfferResume: boolean;
}

/**
 * Hosts may display this as diagnostic information before integration.
 * Calls only read methods of StoragePort and returns no privileged data.
 */
export function inspectReadingPreflight(
  storage: StoragePort,
  manifest: SiteRouteManifest,
): ReadingPreflight {
  const admission = admitReadingManifest(manifest);
  const state = readingStatus(storage);
  const issues: PreflightIssue[] = [];

  if (!admission.ok) issues.push("manifest-invalid");
  if (state.kind === "unavailable") issues.push("storage-unavailable");
  if (state.kind === "disabled") issues.push("consent-disabled");

  const target = admission.ok
    ? resolveResumeTarget(storage, manifest)
    : { kind: "none" as const };

  if (admission.ok && state.kind === "enabled" && target.kind === "none") {
    issues.push("no-saved-position");
  }

  return {
    manifest: admission,
    memory: state.kind,
    resume: target.kind,
    issues,
    canOfferResume: admission.ok && state.kind === "enabled" && target.kind !== "none",
  };
}
