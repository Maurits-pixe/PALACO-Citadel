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
import { chapterRegistryFromManifest, resolveResumeTarget, type SiteRouteManifest } from "./reading-routes";
import { readChapterBookmark } from "./reading-chapter";
import { readingStatus, type StoragePort } from "./reading-state";

export type PreflightIssue =
  | "manifest-invalid"
  | "storage-unavailable"
  | "consent-disabled"
  | "no-saved-position"
  | "chapter-fallback";

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

  // A legacy region fallback is valid but might conceal a stale chapter.
  // Report it as a review signal, not as a failure or automatic repair.
  if (admission.ok && target.kind === "region") {
    const savedChapter = readChapterBookmark(
      storage,
      chapterRegistryFromManifest(manifest),
    );
    if (savedChapter === null) {
      // We cannot distinguish absent v2 data from an invalid v2 bookmark
      // without reading private raw storage; do not claim corruption.
    }
  }

  return {
    manifest: admission,
    memory: state.kind,
    resume: target.kind,
    issues,
    canOfferResume: admission.ok && state.kind === "enabled" && target.kind !== "none",
  };
}
