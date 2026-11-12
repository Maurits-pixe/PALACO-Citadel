/**
 * CITADEL-READING-EPOCH-001
 * Per-view cancellation guard for user-initiated resume requests.
 *
 * This token cancels obsolete requests after awaits; it does NOT cancel
 * an already started host navigation and it is NOT an auth/session token.
 * Invalidate on logout, route replacement, privacy change, or view disposal.
 */
export interface ResumeRequest {
  /** True while this request remains the latest active request. */
  readonly isCurrent: () => boolean;
  /** Explicitly invalidates this request. */
  readonly invalidate: () => void;
}

export interface ResumeRequestCoordinator {
  begin(): ResumeRequest;
  invalidateAll(): void;
}

export function createResumeRequestCoordinator(): ResumeRequestCoordinator {
  let revision = 0;
  return {
    begin(): ResumeRequest {
      revision += 1;
      const requestRevision = revision;
      let cancelled = false;
      return {
        isCurrent: () => !cancelled && requestRevision === revision,
        invalidate: () => {
          cancelled = true;
          if (requestRevision === revision) revision += 1;
        },
      };
    },
    invalidateAll(): void {
      revision += 1;
    },
  };
}
