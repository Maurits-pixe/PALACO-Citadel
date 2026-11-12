/**
 * CITADEL-READING-MOUNT-COORDINATOR-001
 *
 * Host-operated coordinator for one private reading view. Never observes
 * browser auth, grants access, discovers routes or mounts automatically.
 * The host must invoke transition() BEFORE changing its trusted context,
 * then call mountAuthorized() only AFTER independently confirming access.
 */
import {
  mountReadingCompass,
  type MountedReadingCompass,
  type ReadingMountOptions,
} from "./reading-mount";
import type { ReadingLifecycleChange } from "./reading-lifecycle";

export interface ReadingMountCoordinator {
  /** Always close the old reader before a route/session/permission change. */
  transition(change: ReadingLifecycleChange): void;
  /**
   * Host calls only after independently authenticating and authorizing its
   * NEW rendered reader view. No fallback to the old mount on failure.
   */
  mountAuthorized(options: ReadingMountOptions): MountedReadingCompass;
  /** Remove all listeners and end this coordinator permanently. */
  dispose(): void;
  /** Diagnostic only, not evidence of access or live deployment. */
  hasActiveMount(): boolean;
}

export function createReadingMountCoordinator(): ReadingMountCoordinator {
  let current: MountedReadingCompass | null = null;
  let revision = 0;
  let disposed = false;
  let mounting = false;

  const transition = (change: ReadingLifecycleChange): void => {
    if (disposed) return;
    ++revision;
    const previous = current;
    current = null;
    // An exception cannot restore a potentially obsolete old reader.
    previous?.beforeChange(change);
  };

  return {
    transition,
    mountAuthorized(options: ReadingMountOptions): MountedReadingCompass {
      if (disposed) throw new Error("CITADEL_READING_COORDINATOR_DISPOSED");
      if (current !== null || mounting) {
        throw new Error("CITADEL_READING_CONTEXT_ALREADY_MOUNTED");
      }
      const expected = revision;
      mounting = true;
      let created: MountedReadingCompass | null = null;
      try {
        created = mountReadingCompass(options);
        if (disposed || expected !== revision) {
          // Host context changed during mount; never publish a stale reader.
          created.dispose();
          throw new Error("CITADEL_READING_CONTEXT_CHANGED");
        }
        current = created;
        // Return a scoped handle: delayed cleanup from an older caller
        // cannot dispose a later, already-authorized view.
        const mounted = created;
        return {
          beforeChange(change: ReadingLifecycleChange): void {
            if (current === mounted) transition(change);
          },
          clearAfterConfirmation(): void {
            if (!disposed && current === mounted) mounted.clearAfterConfirmation();
          },
          dispose(): void {
            if (current !== mounted) return;
            current = null;
            ++revision;
            mounted.dispose();
          },
        };
      } catch (error) {
        // If the mount completed but was never accepted, close it.
        if (created !== null && current !== created) {
          try { created.dispose(); } catch { /* preserve original failure */ }
        }
        throw error;
      } finally {
        mounting = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      ++revision;
      disposed = true;
      const previous = current;
      current = null;
      previous?.dispose();
    },
    hasActiveMount(): boolean {
      return !disposed && current !== null;
    },
  };
}
